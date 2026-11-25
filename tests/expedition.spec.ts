import { expect, test } from '@playwright/test';
import { Combat, type Enemy } from '../src/combat';
import { FIELD_X, FIELD_Z, QUEST_BOSS, RANGED_ELITES, STAGES, STAGE_TIME, WAVE_COUNT, WAVE_MOB_LIMIT, WAVE_TIME } from '../src/data';
import { QUESTS, QUEST_BUFF_SECONDS, SUPPLIES, type QuestKind } from '../src/expedition';

const still = { x: 0, z: 0 };

function quiet(obstacles: ConstructorParameters<typeof Combat>[0] = [], roll = .5, visible?: ConstructorParameters<typeof Combat>[2]) {
  const game = new Combat(obstacles, () => roll, visible);
  game.enemies.length = 0;
  game.level = 50;
  game.player.heading = 0;
  game.player.immunity = 1000;
  game.cooldown.bolt = 1000;
  Object.assign(game, { nextSpawn: Infinity, opening: 0 });
  return game;
}

function advance(game: Combat, seconds: number) {
  const steps = Math.ceil(seconds / .025);
  for (let i = 0; i < steps; i++) game.step(seconds / steps, still);
}

function startQuest(game: Combat, kind: QuestKind) {
  const npc = game.questNpcs.find((entry) => entry.quest === kind && !entry.done)!;
  Object.assign(game.player, { x: npc.x, z: npc.z });
  expect(game.acceptQuest(npc.id)).toBe(true);
  return npc;
}

function defeatInFront(game: Combat, targets: Enemy[]) {
  game.enemies = targets;
  for (const enemy of targets) Object.assign(enemy, { x: game.player.x, z: game.player.z + 2, speed: 0, hp: 1 });
  game.spells.add('nova');
  game.cooldown.nova = 0;
  expect(game.cast('nova', null, still)).toBe(true);
}

test('the enlarged field keeps regular packs and old monsters at each stage transition', () => {
  expect([FIELD_X * 2, FIELD_Z * 2]).toEqual([960, 720]);
  for (let index = 1; index < STAGES.length; index++) {
    const game = quiet([], .15);
    game.stageIndex = index - 1;
    game.wave = WAVE_COUNT;
    game.time = index * STAGE_TIME - .04;
    Object.assign(game, { nextSpawn: 0 });
    game.step(.02, still);
    const current = [...game.enemies];
    const interval = Reflect.get(game, 'nextSpawn') as number;
    expect(current).toHaveLength(4);
    Object.assign(game, { nextSpawn: 0 });
    game.step(.03, still);
    expect(game.stageIndex).toBe(index);
    expect(game.enemies).toHaveLength(8);
    expect(game.enemies.slice(0, 4)).toEqual(current);
    expect(Reflect.get(game, 'nextSpawn')).toBeLessThanOrEqual(interval);
  }
});

test('every stage boss spawns with half of its previous health', () => {
  const health = [690, 1410, 2280, 3375, 4875, 10_350, 14_400, 18_900, 24_000, 31_500];
  for (const [index, stage] of STAGES.entries()) {
    const game = quiet();
    game.time = index * STAGE_TIME + (WAVE_COUNT - 1) * WAVE_TIME - .01;
    game.step(.02, still);
    expect(game.enemies.find((enemy) => enemy.kind === stage.boss.kind)).toMatchObject({
      hp: health[index], maxHp: health[index],
    });
  }
});

test('far-away regular mobs do not exhaust the spawn budget on a long trek', () => {
  const game = quiet();
  const template = new Combat().enemies[0];
  const boss = { ...template, kind: 'warden' as const, id: 200, speed: 0 };
  game.enemies = Array.from({ length: WAVE_MOB_LIMIT }, (_, i) => ({ ...template, id: 300 + i, x: i * 2 - WAVE_MOB_LIMIT, z: 0, speed: 0 }));
  game.enemies.push(boss);
  game.player.x = 350;
  Object.assign(game, { nextSpawn: 0 });
  game.step(.02, still);
  expect(game.enemies).toHaveLength(WAVE_MOB_LIMIT + 1);
  expect(game.enemies).toContain(boss);
  expect(game.enemies.some((enemy) => Math.hypot(enemy.x - game.player.x, enemy.z - game.player.z) < 17)).toBe(true);
  expect(game.pickups).toHaveLength(0);
});

test('monsters slide around an obstacle instead of stopping on its center line', () => {
  const obstacle = { x: 0, z: 4, radius: 1.4 };
  const game = quiet([obstacle]);
  const enemy = new Combat().enemies[0];
  Object.assign(enemy, { x: 0, z: 8, speed: 2.3 });
  game.enemies.push(enemy);
  let sidestep = 0;
  for (let i = 0; i < 260; i++) {
    game.step(.02, still);
    sidestep = Math.max(sidestep, Math.abs(enemy.x));
    expect(Math.hypot(enemy.x - obstacle.x, enemy.z - obstacle.z)).toBeGreaterThanOrEqual(1.4 - 1e-6);
  }
  expect(sidestep).toBeGreaterThan(1.4);
  expect(Math.hypot(enemy.x, enemy.z)).toBeLessThan(1.2);
});

test('each wave opens across 12 bearings and continues sending offscreen packs through its final seconds', () => {
  const visible = (x: number, z: number) => z < 0 && Math.abs(x) <= -z * .65 && Math.hypot(x, z) < 75;
  const game = quiet([], .5, visible);
  Object.assign(game, { nextSpawn: 0 });
  game.step(.02, still);
  expect(game.enemies).toHaveLength(4);
  const births = new Map<number, { x: number; z: number; time: number }>();
  const record = () => {
    for (const { id, x, z, born } of game.enemies) {
      if (births.has(id)) continue;
      expect(visible(x, z)).toBe(false);
      births.set(id, { x, z, time: born });
    }
  };
  record();
  while (game.time < WAVE_TIME + 2) {
    game.step(.025, still);
    record();
  }
  const arrivals = [...births.values()];
  const opening = arrivals.filter(({ time }) => time < 2);
  const nextOpening = arrivals.filter(({ time }) => time >= WAVE_TIME);
  const sectors = (points: typeof arrivals, rotation = 0) => new Set(points.map(({ x, z }) =>
    ((Math.round((Math.atan2(x, z) - rotation) * 12 / (2 * Math.PI)) % 12) + 12) % 12));
  expect(opening).toHaveLength(12);
  expect(sectors(opening).size).toBe(12);
  expect(new Set(opening.map(({ time }) => time)).size).toBe(3);
  expect(opening.some(({ z }) => z < -65)).toBe(true);
  expect(arrivals.filter(({ time }) => time < WAVE_TIME)).toHaveLength(58);
  expect(arrivals.some(({ time }) => time > WAVE_TIME - 2 && time < WAVE_TIME)).toBe(true);
  expect(nextOpening.length).toBeGreaterThanOrEqual(12);
  expect(sectors(nextOpening.slice(0, 12), 2.399963).size).toBe(12);
});

test('long journeys flank the player and redistribute only distant offscreen pursuers', () => {
  let cameraZ = 0;
  const visible = (x: number, z: number) => z >= cameraZ && Math.abs(x) < (z - cameraZ) * .6 && z - cameraZ < 84;
  const game = quiet([], .5, visible);
  const template = new Combat([], () => .5).enemies[0];
  const pursuer = { ...template, id: 211, x: 0, z: -59, hp: 24, speed: 0 };
  const boss = { ...template, id: 212, kind: 'warden' as const, x: 10, z: -64, speed: 0 };
  const ambush = { ...template, id: 213, questNpcId: 1, x: -10, z: -58, speed: 0 };
  const nearby = { ...template, id: 214, x: 3, z: -2, speed: 0 };
  game.enemies = [pursuer, boss, ambush, nearby];
  const step = () => {
    cameraZ = game.player.z;
    game.step(.025, { x: 0, z: 1 });
  };
  for (let i = 0; i < 185; i++) step();
  expect(game.enemies).toHaveLength(4);
  expect(pursuer).toMatchObject({ id: 211, hp: 24 });
  expect(pursuer.z).toBeGreaterThan(game.player.z - 9);
  expect(Math.abs(pursuer.x)).toBeGreaterThan(8);
  expect([boss.z, ambush.z, nearby.z]).toEqual([-64, -58, -2]);
  expect(game.kills).toBe(0);
  Object.assign(game, { nextSpawn: 0, waveRing: 0 });
  const births = new Map<number, { x: number; z: number }>();
  for (let i = 0; i < 600; i++) {
    step();
    for (const enemy of game.enemies) {
      if (enemy.id >= 200 || births.has(enemy.id)) continue;
      expect(visible(enemy.x, enemy.z)).toBe(false);
      births.set(enemy.id, { x: enemy.x - game.player.x, z: enemy.z - game.player.z });
    }
  }
  const points = [...births.values()];
  expect(points.length).toBeGreaterThan(7);
  expect(points.some(({ x, z }) => x > 6 && z > 3)).toBe(true);
  expect(points.some(({ x, z }) => x < -6 && z > 3)).toBe(true);
  expect(points.filter(({ z }) => z < -9).length).toBeLessThan(points.length / 3);
});

test('enemy bodies occupy separate positions even if spawned exactly on top of each other or frozen', () => {
  const game = quiet();
  const template = new Combat().enemies[0];
  game.enemies = Array.from({ length: 5 }, (_, i) => ({ ...template, id: i + 20, x: 3, z: 6, speed: 0, frozen: i % 2 }));
  advance(game, .13);
  for (const [i, a] of game.enemies.entries()) for (const b of game.enemies.slice(i + 1)) {
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(a.radius + b.radius - 1e-4);
  }
});

test('NPC sites vary by run, include a nearby starter quest, and require a conversation', () => {
  const obstacle = { x: 0, z: -21, radius: 3 };
  const a = quiet([obstacle], .28), b = quiet([obstacle], .73);
  expect(a.questNpcs).toHaveLength(13);
  expect(b.questNpcs).toHaveLength(13);
  expect(a.questNpcs.map(({ x, z }) => [x, z])).not.toEqual(b.questNpcs.map(({ x, z }) => [x, z]));
  expect(a.questNpcs.some((npc) => Math.abs(npc.x) > 220)).toBe(true);
  expect(a.questNpcs.every((npc) => Math.hypot(npc.x, npc.z + 21) > 4.8)).toBe(true);
  const nearest = a.closestQuestNpc!;
  expect(nearest.quest).toBe('hunt');
  expect(Math.hypot(nearest.x, nearest.z)).toBeLessThanOrEqual(26);
  expect(a.nearbyQuestNpc).toBeUndefined();
  expect(a.acceptQuest(nearest.id)).toBe(false);
  startQuest(a, 'hunt');
  expect(a.acceptQuest(nearest.id)).toBe(false);
});

test('the periodic heart heals to full and the later magnet pulls every existing gem including distant fresh drops', () => {
  const game = quiet();
  startQuest(game, 'salvage');
  Object.assign(game.player, { x: FIELD_X - 2, z: FIELD_Z - 2 });
  game.time = SUPPLIES.heart.first - .035;
  game.step(.02, still);
  expect(game.supplies).toHaveLength(0);
  game.step(.02, still);
  const [heart] = game.supplies;
  expect(heart.kind).toBe('heart');
  const distance = Math.hypot(heart.x - game.player.x, heart.z - game.player.z);
  expect(distance).toBeGreaterThanOrEqual(12);
  expect(distance).toBeLessThanOrEqual(23);
  game.hp = 11;
  Object.assign(game.player, { x: heart.x, z: heart.z });
  game.step(.02, still);
  expect(game.hp).toBe(game.maxHp);
  expect(game.supplies).toHaveLength(0);

  game.time = SUPPLIES.magnet.first - .01;
  game.step(.02, still);
  const magnet = game.supplies.find((item) => item.kind === 'magnet')!;
  Object.assign(game.player, { x: magnet.x, z: magnet.z });
  for (let i = 0; i < QUESTS.salvage.target; i++) game.pickups.push({
    x: -FIELD_X + 4, z: -FIELD_Z + 4, phase: 0, age: 0, value: 3, tier: i ? 'normal' : 'boss',
  });
  game.step(.02, still);
  expect(game.pickups.every((gem) => gem.pull !== undefined)).toBe(true);
  expect(game.events).toContainEqual(expect.objectContaining({ kind: 'supply', supply: 'magnet', count: 35 }));
  game.pickups.push({ x: -150, z: -150, phase: 0, age: 1, value: 7, tier: 'normal' });
  advance(game, 1.25);
  expect(game.pickups.map(({ value }) => value)).toEqual([7]);
  expect(game.xp).toBe(35 * 3 + QUESTS.salvage.xp);
  expect(game.gold).toBe(QUESTS.salvage.gold);
  expect(game.quest).toBeNull();
  expect(game.supplies).toHaveLength(0);
});

test('the hunt excludes bosses, rewards once, and gold buys only capped, run-local common talents', () => {
  const game = quiet();
  const template = new Combat().enemies[0];
  const npc = startQuest(game, 'hunt');
  game.time = 15;
  Object.assign(game, { expeditionRng: () => .99 });
  defeatInFront(game, [{ ...template, kind: 'warden' }]);
  expect(game.quest?.progress).toBe(0);
  defeatInFront(game, Array.from({ length: 99 }, (_, i) => ({ ...template, id: i + 20 })));
  expect(game.quest?.progress).toBe(99);
  expect(game.gold).toBe(0);
  game.hp = 50;
  defeatInFront(game, [{ ...template }]);
  expect(game.quest).toBeNull();
  expect(npc.done).toBe(true);
  expect(game.acceptQuest(npc.id)).toBe(false);
  expect(game.xp).toBe(QUESTS.hunt.xp);
  expect(game.gold).toBe(3);
  expect(game.events).toContainEqual({ kind: 'quest-complete', quest: 'hunt', xp: QUESTS.hunt.xp, gold: 3, buff: 'vital' });
  expect(game.buffTime('vital')).toBe(QUEST_BUFF_SECONDS);
  expect([game.hp, game.maxHp]).toEqual([100, 200]);
  expect(game.buyCommonTalent('bolt-power')).toBe(false);
  game.perks.regeneration = 9;
  expect(game.buyCommonTalent('regeneration')).toBe(false);
  expect(game.buyCommonTalent('heart')).toBe(true);
  expect(game.gold).toBe(1);
  expect(game.buyCommonTalent('haste')).toBe(false);
  expect([game.hp, game.maxHp]).toEqual([140, 240]);
  game.time = 15 + QUEST_BUFF_SECONDS - .01;
  game.stageIndex = 1;
  game.step(.02, still);
  expect(game.buffTime('vital')).toBe(0);
  expect([game.hp, game.maxHp]).toEqual([70, 120]);
  expect(new Combat().gold).toBe(0);
  expect(new Combat().perks.heart).toBeUndefined();
});

test('the ambush adds three offscreen packs without replacing normal spawns', () => {
  const game = quiet([], .5, (_x, z) => z >= 0);
  const npc = startQuest(game, 'ambush');
  const template = new Combat().enemies[0];
  Object.assign(game.player, still);
  defeatInFront(game, [{ ...template }]);
  expect(game.quest?.progress).toBe(0);
  game.enemies.length = 0;
  game.pickups.length = 0;
  Object.assign(game, { nextSpawn: .66 });
  for (const elapsed of [.70, 5.55, 5.55]) {
    advance(game, elapsed);
    const tagged = game.enemies.filter((enemy) => enemy.questNpcId === npc.id);
    expect(tagged).toHaveLength(6);
    expect(tagged.every((enemy) => enemy.z < 0)).toBe(true);
    expect(game.enemies.some((enemy) => enemy.questNpcId === undefined)).toBe(true);
    defeatInFront(game, tagged);
    game.enemies.length = 0;
    game.pickups.length = 0;
  }
  expect(game.quest).toBeNull();
  expect(game.gold).toBe(4);
  expect(game.xp).toBe(QUESTS.ambush.xp);
});

test('a quest summons a separate mini-boss with warning patterns and only rewards its defeat', () => {
  const game = quiet([], .5, (_x, z) => z >= 0);
  const npc = startQuest(game, 'guardian');
  Object.assign(game.player, still);
  game.time = WAVE_TIME * (WAVE_COUNT - 1) - .01;
  game.step(.02, still);
  const [stageBoss, questBoss] = [game.enemies.find((enemy) => enemy.kind === 'warden')!, game.questBoss!];
  expect(stageBoss.questNpcId).toBeUndefined();
  expect(questBoss).toMatchObject({ kind: QUEST_BOSS, hp: 600, maxHp: 600, questNpcId: npc.id });
  expect(questBoss.z).toBeLessThan(0);
  expect(game.events).toContainEqual({ kind: 'quest-boss' });
  expect(game.events).toContainEqual({ kind: 'boss', boss: 'warden' });
  advance(game, 2.4);
  const rift = game.hazards.find((hazard) => hazard.cue === 'riftPulse')!;
  expect(rift).toBeDefined();
  const range = Math.hypot(rift.x - game.player.x, rift.z - game.player.z);
  expect(range).toBeGreaterThan(0);
  expect(range + rift.radius).toBeLessThanOrEqual(game.moveSpeed * rift.windup + 1e-6);
  advance(game, 5.60);
  expect(game.hazards.some((hazard) => hazard.cue === 'riftLine')).toBe(true);
  defeatInFront(game, [stageBoss]);
  expect(game.quest?.progress).toBe(0);
  defeatInFront(game, [questBoss]);
  expect(game.quest).toBeNull();
  expect(game.gold).toBe(5);
  expect(game.events).toContainEqual(expect.objectContaining({ kind: 'quest-complete', quest: 'guardian' }));
});

test('an exploration quest generates three separated signals, removed only when reached', () => {
  const game = quiet();
  const npc = startQuest(game, 'signals');
  const points = [...game.quest!.signals];
  expect(points).toHaveLength(3);
  expect(points.every((point) => {
    const distance = Math.hypot(point.x - npc.x, point.z - npc.z);
    return distance >= 55 && distance <= 120;
  })).toBe(true);
  expect(points.every((point, i) => points.slice(i + 1).every((other) => Math.hypot(point.x - other.x, point.z - other.z) >= 40))).toBe(true);
  expect(game.nextQuestSignal).toBeDefined();
  for (const [index, point] of points.entries()) {
    Object.assign(game.player, point);
    game.step(.02, still);
    expect(game.quest?.signals.length ?? 0).toBe(2 - index);
    expect(game.events.filter((event) => event.kind === 'quest-signal')).toHaveLength(index + 1);
    game.step(.02, still);
    expect(game.events.filter((event) => event.kind === 'quest-signal')).toHaveLength(index + 1);
  }
  expect(game.gold).toBe(3);
  expect(game.xp).toBe(QUESTS.signals.xp);
});

function bossFixture(index: number, cycle = 0, obstacles: ConstructorParameters<typeof Combat>[0] = []) {
  const game = quiet(obstacles);
  Object.assign(game, { attackRng: () => .5 });
  game.time = index * STAGE_TIME + (WAVE_COUNT - 1) * WAVE_TIME - .01;
  game.step(.02, still);
  const boss = game.enemies.find((enemy) => enemy.kind === game.stage.boss.kind)!;
  game.enemies = [boss];
  Object.assign(boss, { x: 0, z: -8, speed: 0, attackAt: game.time, attackPattern: cycle });
  game.player.immunity = 0;
  game.step(.02, still);
  return { game, boss };
}

test('later stage bosses wind up the same attacks but have shorter gaps between casts', () => {
  const rates = [];
  for (let stage = 1; stage < STAGES.length; stage++) {
    const { game, boss } = bossFixture(stage);
    const attack = STAGES[stage].boss.attack!;
    expect(game.hazards[0].windup).toBe(attack.windup);
    rates.push((boss.attackAt! - game.time) / attack.interval);
  }
  expect(rates.every((scale, i) => i === 0 || scale < rates[i - 1] - .001)).toBe(true);
});

test('clockwork hits slow actual player movement by 30% for three seconds; dodging prevents the debuff', () => {
  for (const cycle of [0, 1]) {
    const { game } = bossFixture(5, cycle);
    const fullSpeed = game.moveSpeed;
    const mark = game.hazards[0];
    expect(mark.slow).toEqual({ seconds: 3, percent: 30 });
    advance(game, mark.windup - .04);
    expect(game.player.slow).toBe(0);
    game.step(.06, still);
    expect(game.player.slow).toBe(3);
    expect(game.moveSpeed).toBeCloseTo(fullSpeed * .70);
    game.step(.3, { x: 1, z: 0 });
    expect(game.player.x).toBeCloseTo(fullSpeed * .70 * .3);
    advance(game, 2.7);
    expect(game.player.slow).toBe(0);
    expect(game.moveSpeed).toBeCloseTo(fullSpeed);

    const dodge = bossFixture(5, cycle).game;
    dodge.player.x = 8;
    advance(dodge, mark.windup + .08);
    expect(dodge.hp).toBe(100);
    expect(dodge.player.slow).toBe(0);
  }
});

for (const [index, cue] of [[7, 'stormCharge'], [9, 'dawnCharge']] as const) {
  test(`${cue} locks the charge lane before moving and only hits the traversed path`, () => {
    const { game, boss } = bossFixture(index, 2);
    const [mark] = game.hazards;
    expect(mark.cue).toBe(cue);
    const charge = mark.charge!;
    expect(charge.to.x).toBeCloseTo(0);
    expect(charge.to.z).toBeGreaterThan(0);
    expect(Math.hypot(charge.to.x, charge.to.z) + mark.radius).toBeLessThanOrEqual(game.moveSpeed * mark.windup);
    expect(boss.bracing).toBe(true);
    advance(game, mark.windup - .04);
    expect(boss.z).toBe(-8);
    expect(game.hp).toBe(100);
    game.step(.065, still);
    expect(boss.dash).toBeDefined();
    expect(game.hp).toBe(100);
    advance(game, charge.travel + .02);
    expect(boss.z).toBeCloseTo(charge.to.z);
    expect(boss.dash).toBeUndefined();
    expect(game.hp).toBe(100 - mark.damage);

    const dodge = bossFixture(index, 2).game;
    dodge.player.x = mark.radius + .35;
    advance(dodge, mark.windup + charge.travel + .05);
    expect(dodge.hp).toBe(100);
  });
}

test('the charge preview stops before terrain and is cancelled if the boss is frozen beforehand', () => {
  const obstacle = { x: 0, z: -2.5, radius: .80 };
  const { game, boss } = bossFixture(7, 2, [obstacle]);
  const [mark] = game.hazards;
  const end = mark.charge!.to;
  expect(Math.abs(obstacle.z - end.z)).toBeGreaterThan(obstacle.radius + boss.radius * .71);
  expect(end.z).toBeLessThan(-4);
  boss.frozen = 1;
  game.step(.02, still);
  expect(game.hazards).toHaveLength(0);
  expect(boss.bracing).toBeUndefined();
  expect(boss.dash).toBeUndefined();
});

for (const [index, [kind, stats]] of Object.entries(RANGED_ELITES).entries()) {
  function armRanged(moving = false) {
    const game = quiet([], .04);
    game.stageIndex = 7 + index;
    game.time = game.stageIndex * STAGE_TIME + 1;
    Object.assign(game, { nextSpawn: 0 });
    game.step(.02, still);
    const enemy = game.enemies.find((entry) => entry.kind === kind)!;
    game.enemies = [enemy];
    game.player.immunity = 0;
    Object.assign(enemy, { x: 0, z: -9, attackAt: game.time });
    Object.assign(game, { nextSpawn: Infinity });
    game.step(.02, moving ? { x: 1, z: 0 } : still);
    return game;
  }
  test(`${kind} declares ranged marks that lock before impact and can be dodged`, () => {
    const hit = armRanged();
    const mark = hit.hazards[0];
    const attack = stats.attack;
    expect(mark).toMatchObject({ radius: attack.radius, windup: attack.windup, cue: attack.cue, elite: true });
    const range = Math.hypot(mark.x, mark.z);
    expect(range).toBeGreaterThan(0);
    expect(range + mark.radius).toBeLessThanOrEqual(hit.moveSpeed * attack.windup + 1e-6);
    expect(hit.hazards).toHaveLength(attack.offsets.length);
    expect(hit.events).toContainEqual(expect.objectContaining({ kind: 'enemy-warning', cue: attack.cue, elite: true }));
    advance(hit, attack.windup - .04);
    expect(hit.hp).toBe(100);
    expect(Math.abs(hit.enemies[0].z)).toBeCloseTo(stats.hold, 0);
    Object.assign(hit.player, { x: mark.x, z: mark.z });
    advance(hit, .08);
    expect(hit.hp).toBe(100 - attack.damage);
    expect(hit.events).toContainEqual({ kind: 'enemy-blast', x: mark.x, z: mark.z, radius: mark.radius, cue: attack.cue, elite: true });

    const dodge = armRanged(true);
    const leadMark = dodge.hazards[0];
    const x = leadMark.x;
    expect(Math.hypot(x - dodge.player.x, leadMark.z - dodge.player.z)).toBeGreaterThan(.1);
    for (let i = 0; i < 90; i++) dodge.step(.022, { x: 1, z: 0 });
    expect(leadMark.x).toBe(x);
    expect(dodge.hp).toBe(100);
  });
}

for (const [draw, buff, multiplier] of [[.1, 'power', 1.10], [.5, 'swift', 1.10]] as const) {
  test(`${buff} buffs affect combat for exactly three minutes of run time`, () => {
    const game = quiet();
    startQuest(game, 'salvage');
    Object.assign(game, { expeditionRng: () => draw });
    for (let i = 0; i < QUESTS.salvage.target; i++) game.pickups.push({ x: game.player.x, z: game.player.z, age: 1, value: 1, phase: 0, tier: 'normal' });
    const speedBefore = game.moveSpeed;
    game.step(.02, still);
    expect(game.buffTime(buff)).toBe(QUEST_BUFF_SECONDS);
    expect(game.moveSpeed).toBeCloseTo(speedBefore * (buff === 'swift' ? multiplier : 1));
    const enemy = new Combat().enemies[0];
    Object.assign(enemy, { x: game.player.x, z: game.player.z + 2, speed: 0, hp: 100 });
    game.enemies.push(enemy);
    game.spells.add('nova');
    game.cast('nova', null, still);
    expect(100 - enemy.hp).toBe(buff === 'power' ? 20 : 18);
    game.status = 'upgrade';
    game.step(10, still);
    expect(game.buffTime(buff)).toBe(QUEST_BUFF_SECONDS);
    game.status = 'playing';
    game.time = game.buffs[buff] - .01;
    game.step(.02, still);
    expect(game.buffTime(buff)).toBe(0);
    expect(game.moveSpeed).toBeCloseTo(speedBefore);
  });
}
