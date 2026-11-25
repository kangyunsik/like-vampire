import { parseArgs } from 'node:util';
import { build } from 'vite';
import { buildChoice, expeditionTarget, steering, turnTowardThreat, useExpedition } from './balance-driver.mjs';

const { values } = parseArgs({ options: {
  seeds: { type: 'string', default: '6' }, seed: { type: 'string', default: '401' }, json: { type: 'boolean' },
  style: { type: 'string' }, class: { type: 'string' }, unique: { type: 'string' }, expedition: { type: 'boolean' },
  'force-blizzard': { type: 'boolean' },
  stage: { type: 'string' }, 'test-build': { type: 'string' },
  'bomb-focus': { type: 'boolean' },
} });
const count = Number(values.seeds), first = Number(values.seed);
if (!Number.isInteger(count) || count < 1 || count > 100 || !Number.isSafeInteger(first)) {
  throw new Error('Use --seeds 1–100 and an integer --seed');
}
if (values.style && !['balanced', 'elemental', 'area', 'blizzard'].includes(values.style)) throw new Error('Use --style balanced, elemental, area, or blizzard');
if (values.class && !['frost', 'fire'].includes(values.class)) throw new Error('Use --class frost or fire');
if ((values.style === 'blizzard' || values['force-blizzard']) && values.class !== 'frost') throw new Error('The Blizzard preset requires --class frost');
if (values.unique !== undefined && !values.class) throw new Error('--unique requires --class');
if (values['test-build'] !== undefined && values.stage === undefined) throw new Error('--test-build requires --stage');
if (values.stage !== undefined && (values.unique !== undefined || values['force-blizzard'])) {
  throw new Error('--stage already prepares a loadout; do not combine it with --unique or --force-blizzard');
}
if (values['test-build'] === 'chain' && values.class !== 'frost') throw new Error('Chain practice requires --class frost');
if (values['bomb-focus'] && (values.class !== 'fire' || values.stage === undefined)) {
  throw new Error('--bomb-focus requires --class fire and a late --stage with Living Bomb learned');
}

// Bundle the real simulation without opening a browser or running a Vite server.
const { output } = await build({
  configFile: false, logLevel: 'warn', build: { ssr: 'scripts/balance-entry.ts', write: false },
});
const code = output.find((item) => item.type === 'chunk').code;
const { Combat, prepareStageTrial, stageTrial, RUN_TIME, STAGE_TIME, STAGES, FIELD_X, FIELD_Z, isBoss, FIRE_UNLOCKS, SPELL_UNLOCKS, RARITIES, SPELL_RARITY } =
  await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const frostUnlocks = new Map(SPELL_UNLOCKS.map((unlock) => [unlock.spell, unlock]));
const fixedUnlock = (values.class === 'frost' ? SPELL_UNLOCKS : FIRE_UNLOCKS)
  .find(({ spell }) => spell === values.unique && SPELL_RARITY[spell] === 'unique');
if (values.unique !== undefined && !fixedUnlock) throw new Error(`Unknown ${values.class} unique spell: ${values.unique}`);

function chooseUpgrade(game, style) {
  const fixed = game.level === RARITIES.unique.level ? fixedUnlock
    : game.level === RARITIES.common.level && values['force-blizzard'] ? frostUnlocks.get('blizzard') : undefined;
  if (!fixed) return buildChoice(game, style, SPELL_RARITY);
  if (!game.choices.some(({ id }) => id === fixed.id)) {
    // Replace only the guaranteed milestone card, without changing how the game rolls its offers.
    const slot = game.choices.findIndex(({ spell }) => SPELL_RARITY[spell] === SPELL_RARITY[fixed.spell]);
    if (slot < 0) throw new Error(`Expected a ${SPELL_RARITY[fixed.spell]} offer at level ${game.level}`);
    game.choices[slot] = fixed;
  }
  return fixed;
}

function random(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

const dt = 1 / 30;
const empty = () => ({ seconds: 0, damage: 0, effective: 0, dot: 0, taken: 0, kills: 0, bosses: 0, bossSpawns: 0, levels: 0,
  control: 0, burning: 0, enemies: 0, consumedChill: 0, chargedLightning: 0, bombTransfers: 0, casts: {}, hits: {}, bySpell: {}, utility: {} });
const emptyUtility = () => ({ frozenSeconds: 0, slowEquivalentSeconds: 0, absorbed: 0, interruptions: 0 });
const utility = (stats, spell) => stats.utility[spell] ??= emptyUtility();
const stages = ['early', 'middle', 'late', 'endgame'];
const phases = (stage) => stage < 2 ? 0 : stage < 5 ? 1 : stage < 7 ? 2 : 3;

function simulate(id, style, seed) {
  const game = new Combat([], random(seed), undefined, id);
  const trial = values.stage === undefined ? undefined : stageTrial(Number(values.stage), values['test-build'] ?? 'balanced', id);
  if (trial) prepareStageTrial(game, trial);
  if (values['bomb-focus']) {
    if (!game.spells.has('livingBomb')) throw new Error('Use a late stage with Living Bomb already learned');
    Object.assign(game.perks, { 'living-bomb-power': 7, 'living-bomb-ignite': 5, 'bomb-radius': 5, 'bomb-spread': 10,
      'flamestrike-power': 2, 'flamestrike-radius': 1 });
  }
  const startTime = game.time;
  const starter = game.spells.values().next().value;
  const learnedAt = new Map([...game.spells].map((spell) => [spell, { time: startTime, level: game.level, starterDamage: 0 }]));
  const summary = stages.map(empty);
  const picked = [];
  const expedition = { quests: 0, talents: 0, heart: 0, magnet: 0, guardian: 0, signals: 0 };
  const damage = new Map();
  const bosses = new Map();
  let movement = { x: 0, z: 0 }, frame = 0;
  while (game.status === 'playing' || game.status === 'upgrade') {
    if (game.status === 'upgrade') {
      const choice = chooseUpgrade(game, style);
      if (choice.spell) learnedAt.set(choice.spell, {
        time: game.time, level: game.level, starterDamage: game.spellDamage.get(starter) ?? 0,
      });
      picked.push(choice.id);
      game.choose(choice.id);
      continue;
    }
    if (frame % 5 === 0) {
      if (values.expedition && useExpedition(game)) expedition.talents++;
      movement = steering(game, FIELD_X, FIELD_Z, values.expedition ? expeditionTarget(game) : undefined,
        values.expedition ? game.quest?.npc : undefined);
    }
    turnTowardThreat(game, dt);
    const stats = summary[phases(game.stageIndex)];
    const previousKills = game.kills, previousLevel = game.level;
    game.step(dt, movement);
    stats.seconds += dt;
    stats.kills += game.kills - previousKills;
    stats.levels += game.level - previousLevel;
    let dealtDamage = false;
    for (const event of game.events) {
      if (event.kind === 'strike') {
        dealtDamage = true;
        stats.damage += event.damage;
        if (event.dot) stats.dot += event.damage;
        if (event.spell && !event.dot) stats.hits[event.spell] = (stats.hits[event.spell] ?? 0) + 1;
      }
      if (event.kind === 'cast') {
        if (event.spell === 'livingBomb' && event.path) stats.bombTransfers += event.path.length - 1;
        else stats.casts[event.spell] = (stats.casts[event.spell] ?? 0) + 1;
      }
      if (event.kind === 'chain-lightning-hit') {
        if (event.consumedChill) stats.consumedChill++;
        if (!event.hop && event.charged) stats.chargedLightning++;
      }
      if (event.kind === 'boss') stats.bossSpawns++;
      if (event.kind === 'hurt') stats.taken += event.damage;
      if (event.kind === 'block') utility(stats, id === 'frost' ? 'barrier' : 'fireBarrier').absorbed += event.absorbed;
      if (event.kind === 'interrupt') utility(stats, event.source).interruptions++;
      if (event.kind === 'quest-complete') {
        expedition.quests++;
        if (event.quest === 'guardian' || event.quest === 'signals') expedition[event.quest]++;
      }
      if (event.kind === 'supply') expedition[event.supply]++;
    }
    if (dealtDamage) for (const [spell, total] of game.spellDamage) {
      const delta = total - (damage.get(spell) ?? 0);
      if (delta <= 0) continue;
      stats.effective += delta;
      stats.bySpell[spell] = (stats.bySpell[spell] ?? 0) + delta;
      damage.set(spell, total);
    }
    game.events.length = 0;
    if (frame % 5 === 0) for (const enemy of game.enemies) {
      if (enemy.hp <= 0) continue;
      stats.enemies++;
      if (enemy.slow || enemy.frozen) stats.control++;
      if (enemy.ignite) stats.burning++;
      if (enemy.frozen && enemy.freezeSource) {
        utility(stats, enemy.freezeSource).frozenSeconds += dt * 5;
      } else if (enemy.slow && enemy.chills) {
        let strongest = '', power = 0;
        for (const [source, effect] of Object.entries(enemy.chills)) {
          if (effect.power > power) { strongest = source; power = effect.power; }
        }
        if (strongest) utility(stats, strongest).slowEquivalentSeconds += dt * 5 * power;
      }
    }
    for (const enemy of game.enemies) if (enemy.questNpcId === undefined && isBoss(enemy.kind) && !bosses.has(enemy)) bosses.set(enemy, stats);
    for (const [boss, spawnPhase] of bosses) {
      if (boss.hp > 0) continue;
      spawnPhase.bosses++;
      bosses.delete(boss);
    }
    frame++;
  }
  const spellDamage = Object.fromEntries(game.spellDamage);
  const utilityBySpell = {};
  for (const phase of summary) for (const [spell, stats] of Object.entries(phase.utility)) {
    const summed = utilityBySpell[spell] ??= emptyUtility();
    for (const key of Object.keys(stats)) summed[key] += stats[key];
  }
  const totalDamage = Object.values(spellDamage).reduce((a, b) => a + b, 0);
  const spellStats = Object.fromEntries([...learnedAt].map(([spell, { time, level, starterDamage }]) => {
    const secondsKnown = game.time - time;
    const casts = summary.reduce((total, phase) => total + (phase.casts[spell] ?? 0), 0);
    const hits = summary.reduce((total, phase) => total + (phase.hits[spell] ?? 0), 0);
    const damageSinceLearning = spellDamage[spell] ?? 0;
    return [spell, {
      learnedAt: time, learnedLevel: level, secondsKnown, casts, hits, damageSinceLearning,
      share: totalDamage ? damageSinceLearning / totalDamage : 0,
      castsPerMinute: secondsKnown ? casts * 60 / secondsKnown : 0,
      hitsPerCast: casts ? hits / casts : 0,
      damagePerCast: casts ? damageSinceLearning / casts : 0,
      damagePerMinute: secondsKnown ? damageSinceLearning * 60 / secondsKnown : 0,
      ...(spell === 'chainLightning' ? {
        consumedChill: summary.reduce((total, phase) => total + phase.consumedChill, 0),
        chargedCasts: summary.reduce((total, phase) => total + phase.chargedLightning, 0),
      } : {}),
      ...(spell === 'livingBomb' ? { transfers: summary.reduce((total, phase) => total + phase.bombTransfers, 0) } : {}),
      starterDamageInWindow: (spellDamage[starter] ?? 0) - starterDamage,
    }];
  }));
  return { id, style, seed, won: game.status === 'won', time: game.time, startTime, trial, level: game.level, summary, picked,
    spellDamage, spellStats, utilityBySpell, learned: [...game.spells], perks: game.perks, expedition };
}

const results = [];
const styles = values.style ? [values.style] : ['balanced', 'elemental'];
const classes = values.class ? [values.class] : ['frost', 'fire'];
for (const style of styles) for (const id of classes) {
  for (let i = 0; i < count; i++) results.push(simulate(id, style, first + i * 103));
}
if (values.json) console.log(JSON.stringify({ totalSeconds: RUN_TIME, phases: stages, fixedUnique: values.unique, bombFocus: values['bomb-focus'], results }));
else {
  const groups = new Map();
  for (const run of results) {
    const key = `${run.id} · ${run.style}`;
    const group = groups.get(key) ?? [];
    group.push(run);
    groups.set(key, group);
  }
  const round = (n, places = 1) => n.toFixed(places);
  for (const [title, group] of groups) {
    const won = group.filter((run) => run.won).length;
    const meanLevel = group.reduce((total, run) => total + run.level, 0) / group.length;
    const preset = group[0].trial ? ` (stage ${group[0].trial.stage}, ${values['bomb-focus'] ? 'bomb focus' : group[0].trial.build} preset)`
      : fixedUnlock ? ` (${fixedUnlock.spell} at LV ${RARITIES.unique.level})` : '';
    console.log(`${title}${preset} — ${won}/${group.length} clears, mean LV ${round(meanLevel)} (${STAGES.length} stages, ${RUN_TIME / 60} min)`);
    if (values.expedition) {
      const totals = Object.fromEntries(['quests', 'talents', 'heart', 'magnet', 'guardian', 'signals'].map((key) =>
        [key, group.reduce((total, run) => total + run.expedition[key], 0)]));
      console.log(`Expedition totals: ${totals.quests} quests (${totals.guardian} miniboss, ${totals.signals} signals), ${totals.talents} talent purchases, ${totals.heart} hearts, ${totals.magnet} magnets`);
    }
    console.table(stages.map((phase, i) => {
      const sums = group.map((run) => run.summary[i]).reduce((total, row) => {
        for (const key of Object.keys(total)) if (typeof total[key] === 'number') total[key] += row[key];
        return total;
      }, empty());
      const seconds = Math.max(1, sums.seconds);
      return { phase, 'raw DPS': round(sums.damage / seconds), 'effective DPS': round(sums.effective / seconds),
        'kills/min': round(sums.kills * 60 / seconds), 'HP lost/min': round(sums.taken * 60 / seconds),
        'boss kills': `${sums.bosses}/${sums.bossSpawns}`, 'slow/freeze %': round(sums.control * 100 / Math.max(1, sums.enemies)),
        'ignite %': round(sums.burning * 100 / Math.max(1, sums.enemies)) };
    }));
    console.log(`Phase cutoffs: ${[2, 5, 7].map((stage) => stage * STAGE_TIME / 60).join(', ')} min`);
  }
}
