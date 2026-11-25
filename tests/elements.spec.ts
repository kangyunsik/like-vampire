import { expect, test } from '@playwright/test';
import { Combat } from '../src/combat';
import { ALL_SPELLS, CINDER_MARKS, CINDER_VORTEX, EMBER_BRAND, FIRE_BARRIER, FIRE_SPELLS, FLASHPOINT, FROZEN_ORB, GLOBAL_DAMAGE_PERCENT,
  IGNITE_PERCENT, INFERNO_BURN_BOOST_PERCENT, RARITIES, SPELL_RARITY, SPELLS, STAGES, STAGE_TIME, UPGRADES, WAVE_COUNT, WAVE_TIME, type MageClass } from '../src/data';

const still = { x: 0, z: 0 };
const ignition = IGNITE_PERCENT / 100;

function arena(id: MageClass = 'frost', roll = .5, positions = [[0, 4]]) {
  const game = new Combat([], () => roll, undefined, id);
  game.player.heading = 0;
  game.enemies = positions.map(([x, z], i) =>
    Object.assign(game.enemies[i] ?? { ...game.enemies[0], id: i + 1 }, { x, z, hp: 1000, maxHp: 1000, speed: 0 }));
  Object.assign(game, { nextSpawn: Infinity });
  game.cooldown.bolt = game.cooldown.fireball = 999;
  return game;
}

function advance(game: Combat, seconds: number) {
  const frames = Math.ceil(seconds / .02);
  for (let i = 0; i < frames; i++) game.step(seconds / frames, still);
}

test('both mage specializations get the correct tier counts and unlock milestones', () => {
  expect(new Set(ALL_SPELLS.map(({ id }) => id)).size).toBe(ALL_SPELLS.length);
  for (const [id, book] of [['frost', SPELLS], ['fire', FIRE_SPELLS]] as const) {
    for (const [tier, total] of [['common', 8], ['rare', 4], ['epic', 3], ['unique', 2]] as const) {
      expect(book.filter(({ id }) => SPELL_RARITY[id] === tier)).toHaveLength(total + Number(id === 'frost' && tier !== 'common'));
      const { level } = RARITIES[tier];
      const game = arena(id);
      game.level = level - 1;
      game.xp = game.goal;
      game.step(.02, still);
      const offers = game.choices.flatMap((choice) => 'spell' in choice ? [choice.spell] : []);
      expect(offers.some((spell) => SPELL_RARITY[spell] === tier)).toBe(true);
      expect(offers.every((spell) => RARITIES[SPELL_RARITY[spell]].level <= level && book.some(({ id }) => id === spell))).toBe(true);
    }
  }
});

test('crit chance and crit damage choices affect both starters, and fire leaves ignite based on the crit', () => {
  for (const [id, starter, rng, normal, critical] of [['frost', 'bolt', .06, 21, 36], ['fire', 'fireball', .37, 23, 40]] as const) {
    for (const rank of [0, 1]) {
      const game = arena(id, rng);
      game.cooldown[starter] = 0;
      game.perks.precision = rank;
      game.perks['critical-force'] = rank;
      advance(game, .28);
      const hit = game.events.find((event) => event.kind === 'strike');
      expect(hit).toMatchObject({ damage: rank ? critical : normal });
      if (rank) expect(hit).toHaveProperty('critical', true);
      if (id === 'fire') {
        expect(game.enemies[0].ignite?.remaining).toBeCloseTo((rank ? critical : normal) * ignition);
        expect(game.enemies[0].frostMarkUntil).toBeUndefined();
      }
    }
  }
});

test('frost crits chill and mark each target, then freeze on the second crit with no extra damage', () => {
  const game = arena('frost', 0, [[-2, 4], [2, 4]]);
  const [first, second] = game.enemies;
  const land = (enemy: typeof first) => {
    game.shots.push({ x: enemy.x, z: enemy.z - .2, vx: 0, vz: 20, life: .1, kind: 'bolt', hits: new Set(), charged: false });
    game.step(.02, still);
  };
  land(first);
  expect(first.chills?.['frost-critical']).toMatchObject({ time: 2, power: .6 });
  expect(first.frostMarkUntil! - game.time).toBeCloseTo(4);
  expect(first.frozen).toBe(0);
  land(second);
  expect(second.frozen).toBe(0);
  land(first);
  expect(first.frozen).toBe(1);
  expect(first.frostMarkUntil).toBeUndefined();
  expect(game.spellDamage.get('bolt')).toBe(105);
  land(first);
  land(first);
  expect(game.events.filter((event) => event.kind === 'frost-crit-freeze')).toHaveLength(1);
  advance(game, 4.1);
  land(second);
  expect(second.frozen).toBe(0);
  advance(game, 4);
  Object.assign(first, { kind: 'warden' });
  game.perks['status-time'] = 1;
  land(first);
  land(first);
  expect(first.frozen).toBeCloseTo(.96);
  expect(game.events.filter((event) => event.kind === 'frost-crit-freeze')).toHaveLength(2);
});

test('damage and area still grow beyond the old rank limits, and 2% XP accumulates from small pickups', () => {
  const frost = arena('frost', .5, [[0, 10]]);
  frost.spells.add('nova');
  Object.assign(frost.perks, { shards: 8, 'nova-power': 7, wide: 6, reach: 5, study: 1 });
  expect(frost.cast('nova', null, still)).toBe(true);
  expect(frost.events).toContainEqual(expect.objectContaining({ kind: 'cast', radius: expect.closeTo(4.1 * 2.9) }));
  expect(frost.enemies[0].hp).toBe(1000 - Math.round(18 * (1 + 8 * GLOBAL_DAMAGE_PERCENT / 100 + 7 * .18)));
  frost.level = 45;
  for (let i = 0; i < 25; i++) {
    frost.pickups.push({ x: 0, z: 0, age: .2, value: 3, phase: 0, tier: 'normal' });
    frost.step(.02, still);
  }
  expect(frost.xp).toBe(76);
});

test('fireball ignite deals exactly the stored amount in ticks; +16% is specific to its source', () => {
  const game = arena('fire');
  game.perks['fireball-ignite'] = 1;
  game.cooldown.fireball = 0;
  advance(game, .26);
  game.cooldown.fireball = 999;
  const enemy = game.enemies[0];
  const amount = 23 * ignition * 1.16;
  expect(enemy.ignite?.remaining).toBeCloseTo(amount);
  advance(game, 4.1);
  expect(enemy.ignite).toBeUndefined();
  expect(enemy.hp).toBeCloseTo(1000 - 23 - amount);
  expect(game.events.filter((event) => event.kind === 'strike' && event.dot)).toHaveLength(4);
  game.spells.add('fireBlast');
  game.cast('fireBlast', null, still);
  expect(enemy.ignite?.remaining).toBeCloseTo(40 * ignition);
});

test('both classes regenerate 1 HP every ten seconds, with a one-second minimum interval', () => {
  for (const id of ['frost', 'fire'] as const) {
    const game = arena(id, .5, []);
    game.hp = 40;
    advance(game, 9.98);
    expect(game.hp).toBe(40);
    game.status = 'upgrade';
    advance(game, 3);
    expect(game.hp).toBe(40);
    game.status = 'playing';
    advance(game, .02);
    expect(game.hp).toBe(41);

    game.perks.regeneration = 9;
    advance(game, .98);
    expect(game.hp).toBe(41);
    advance(game, .02);
    expect(game.hp).toBe(42);
    game.hp = game.maxHp;
    advance(game, 2);
    expect(game.hp).toBe(game.maxHp);
  }
});

test('status duration extends slow, freeze and ignite, including the fractional final burn tick', () => {
  const cold = arena('frost', .5, [[0, 3]]);
  cold.perks['status-time'] = 5;
  cold.spells.add('nova');
  expect(cold.cast('nova', null, still)).toBe(true);
  expect(cold.enemies[0].frozen).toBeCloseTo(7.4);
  cold.cooldown.bolt = 0;
  advance(cold, .27);
  expect(cold.enemies[0].slow).toBeGreaterThan(6.9);

  const fire = arena('fire', .5, [[0, 3]]);
  fire.perks['status-time'] = 1;
  fire.cooldown.fireball = 0;
  advance(fire, .27);
  fire.cooldown.fireball = 999;
  const enemy = fire.enemies[0];
  expect(enemy.ignite?.ticks).toBe(5.25);
  expect(enemy.ignite?.remaining).toBeCloseTo(23 * ignition * 5.25 / 4);
  advance(fire, 4.02);
  expect(enemy.ignite?.ticks).toBeCloseTo(.25);
  advance(fire, .4);
  expect(enemy.ignite).toBeUndefined();
  expect(fire.events.filter((event) => event.kind === 'strike' && event.dot)).toHaveLength(6);
  expect(fire.spellDamage.get('fireball')).toBeCloseTo(23 + 23 * ignition * 5.25 / 4);
});

test('spell totals count each target’s actual health lost, not overkill', () => {
  const game = arena('frost', .5, [[0, 2.6], [2.4, 0]]);
  game.spells.add('nova').add('lance');
  game.enemies[0].hp = 10;
  expect(game.cast('nova', null, still)).toBe(true);
  expect(game.spellDamage.get('nova')).toBe(10 + 18);
  expect(game.cast('lance', null, still)).toBe(true);
  advance(game, .16);
  expect(game.spellDamage.get('lance')).toBe(66);
  expect(new Combat().spellDamage.size).toBe(0);
});

test('stacked ignite ticks credit their source spells while the unused pool credits the detonating spell', () => {
  const game = arena('fire', .5, [[0, 3.3], [2.65, 3.7]]);
  const target = game.enemies[0];
  game.cooldown.fireball = 0;
  advance(game, .25);
  game.cooldown.fireball = 999;
  game.spells.add('fireBlast').add('flashpoint');
  game.cooldown.flashpoint = 999;
  expect(game.cast('fireBlast', null, still)).toBe(true);
  advance(game, .78);
  const fromBall = 23 + 23 * ignition / 4;
  const fromBlast = 40 + 40 * ignition / 4;
  expect(game.spellDamage.get('fireball')).toBeCloseTo(fromBall);
  expect(game.spellDamage.get('fireBlast')).toBeCloseTo(fromBlast);

  target.hp = 5;
  game.cooldown.flashpoint = 0;
  expect(game.cast('flashpoint', null, still)).toBe(true);
  expect(game.spellDamage.get('flashpoint')).toBeCloseTo(5 + FLASHPOINT.damage + (23 + 40) * ignition * .75 * FLASHPOINT.splash);
  expect(game.spellDamage.get('fireball')).toBeCloseTo(fromBall);
  expect(game.spellDamage.get('fireBlast')).toBeCloseTo(fromBlast);
});

test('ignite stacks without postponing the next tick and Flashpoint consumes only the remaining damage', () => {
  const game = arena('fire', .5, [[0, 3.3], [2.65, 3.7]]);
  const [target, neighbor] = game.enemies;
  game.spells.add('fireBlast').add('flashpoint');
  game.cooldown.flashpoint = 999;
  game.cast('fireBlast', null, still);
  advance(game, .45);
  const next = target.ignite?.next;
  game.cooldown.fireBlast = 0;
  game.cast('fireBlast', null, still);
  expect(target.ignite?.next).toBe(next);
  const pool = 80 * ignition;
  expect(target.ignite?.remaining).toBeCloseTo(pool);
  advance(game, .39);
  const remaining = pool * .75;
  expect(target.ignite?.remaining).toBeCloseTo(remaining);
  game.cooldown.flashpoint = 0;
  const before = target.hp;
  expect(game.cast('flashpoint', null, still)).toBe(true);
  expect(target.hp).toBeCloseTo(before - FLASHPOINT.damage - remaining);
  expect(neighbor.hp).toBeCloseTo(1000 - FLASHPOINT.damage - remaining * FLASHPOINT.splash);
  expect(target.ignite).toBeUndefined();
  expect(neighbor.ignite).toBeUndefined();
});

test('Flamestrike radius ranks add to universal radius; most damage is instant, not in the embers', () => {
  const game = arena('fire', .5, [[0, 4], [4.12, 4]]);
  game.spells.add('flamestrike');
  game.perks.reach = 1;
  game.perks['flamestrike-radius'] = 1;
  expect(game.cast('flamestrike', null, still)).toBe(true);
  expect(game.storms[0].radius).toBeCloseTo(3.4 * 1.26);
  expect(game.enemies.every((enemy) => enemy.hp === 952)).toBe(true);
  const burn = game.enemies[0].ignite!.remaining;
  advance(game, .90);
  expect(game.enemies[0].hp).toBeCloseTo(952 - 3 - burn / 4);
  expect(game.enemies[0].ignite?.remaining).toBeCloseTo(burn * .75);
});

test('Living Bomb gains ten points per early rank, five per late rank and never guarantees spread', () => {
  for (const [rank, roll, spreads] of [
    [0, .08, false], [1, .08, true], [1, .10, false], [1, .15, false], [2, .15, true],
    [5, .50, false], [6, .53, true], [6, .56, false], [10, .74, true], [10, .75, false],
  ] as const) {
    const game = arena('fire', roll, [[0, 4], [3.3, 4]]);
    game.spells.add('livingBomb');
    game.perks['bomb-spread'] = rank;
    game.perks['bomb-radius'] = 1;
    game.perks.reach = 1;
    expect(game.cast('livingBomb', null, still)).toBe(true);
    expect(game.bombs[0].radius).toBeCloseTo(3.0 * 1.28);
    advance(game, 1.72);
    expect(game.enemies[1].hp).toBeLessThan(1000);
    expect(game.bombs).toHaveLength(spreads ? 1 : 0);
    if (spreads) expect(game.bombs[0].target).toBe(game.enemies[1]);
  }
});

test('rank one Living Bomb rolls separately for each survivor and can spread to more than one enemy', () => {
  const game = arena('fire', .5, [[0, 4], [1.4, 4], [-1.5, 4], [0, 6.4]]);
  const [source, closest, second, third] = game.enemies;
  game.spells.add('livingBomb');
  game.perks['bomb-spread'] = 1;
  expect(game.cast('livingBomb', null, still)).toBe(true);
  const rolls = [.5, .5, .5, .5, .12, .07, .09]; // Four damage rolls, then three independent spreads.
  Object.assign(game, { rng: () => rolls.shift() ?? .5 });
  advance(game, 1.31);
  expect(rolls).toHaveLength(0);
  expect(game.bombs.map((bomb) => bomb.target)).toEqual([second, third]);
  expect(game.bombs.map((bomb) => bomb.power)).toEqual([2 ** -.75, 2 ** -.75]);
  expect(game.bombs.every((bomb) => bomb.target !== source && bomb.target !== closest && bomb.delay > 1.2)).toBe(true);
  expect(game.events).toContainEqual(expect.objectContaining({ kind: 'cast', spell: 'livingBomb', path: [
    { x: source.x, z: source.z }, { x: second.x, z: second.z }, { x: third.x, z: third.z },
  ] }));
});

test('even at maximum spread, Living Bomb skips dead, distant and already bombed enemies', () => {
  const game = arena('fire', .5, [[0, 4], [1.4, 4], [-1.5, 4], [0, 6.4], [0, 8.5]]);
  const [, occupied, dead, eligible] = game.enemies;
  game.spells.add('livingBomb');
  game.perks['bomb-spread'] = 10;
  dead.hp = 5;
  expect(game.cast('livingBomb', null, still)).toBe(true);
  const prior = { x: occupied.x, z: occupied.z, target: occupied, delay: 3, radius: 3, spread: true, power: 1 };
  game.bombs.push(prior);
  advance(game, 1.31);
  expect(dead.hp).toBeLessThanOrEqual(0);
  expect(game.bombs.map((bomb) => bomb.target)).toEqual([occupied, eligible]);
  expect(game.bombs[0]).toBe(prior);
});

test('a split bomb spends only its share of the stored ignite and preserves credit for the rest', () => {
  const game = arena('fire', .5, [[0, 4], [1.4, 4]]);
  const [target, neighbor] = game.enemies;
  target.ignite = { remaining: 80, next: 1, ticks: 4, sources: new Map([['fireball', 60], ['cinderMarks', 20]]) };
  game.bombs.push({ x: target.x, z: target.z, target, delay: .01, radius: 3, spread: true, power: .5 });
  game.step(.02, still);
  expect(target.hp).toBe(1000 - 40 - 21);
  expect(neighbor.hp).toBe(1000 - 20 - 21);
  expect(target.ignite.remaining).toBeCloseTo(40);
  expect(target.ignite.sources.get('fireball')).toBe(30);
  expect(target.ignite.sources.get('cinderMarks')).toBe(10);
  expect(neighbor.ignite).toBeUndefined();
  expect(game.spellDamage.get('livingBomb')).toBe(102);
});

test('Living Bomb copies with the same fuse do not re-prime one another during their detonation wave', () => {
  const game = arena('fire', .5, [[0, 4], [1.4, 4], [-1.4, 4]]);
  const [first, second, eligible] = game.enemies;
  game.perks['bomb-spread'] = 10;
  for (const target of [first, second]) {
    game.bombs.push({ x: target.x, z: target.z, target, delay: .01, radius: 3, spread: true, power: .5 });
  }
  game.step(.02, still);
  expect(game.bombs.map((bomb) => bomb.target)).toEqual([eligible]);
  expect(game.bombs[0].power).toBeCloseTo(.36);
  expect(game.events.filter((event) => event.kind === 'fireburst')).toHaveLength(2);
});

test('a fresh Living Bomb replaces a transferred bomb rather than being blocked by it', () => {
  const game = arena('fire');
  const [target] = game.enemies;
  game.bombs.push({ x: target.x, z: target.z, target, delay: .01, radius: 3, spread: true, power: .1 });
  game.spells.add('livingBomb');
  expect(game.cast('livingBomb', null, still)).toBe(true);
  expect(game.bombs).toHaveLength(1);
  expect(game.bombs[0]).toMatchObject({ target, power: 1, spread: false, delay: 1.3 });
});

test('a spent branch still damages its target but does not re-seed the remaining crowd', () => {
  const game = arena('fire', .5, [[0, 4], [1.4, 4]]);
  const [target, neighbor] = game.enemies;
  game.perks['bomb-spread'] = 10;
  game.bombs.push({ x: target.x, z: target.z, target, delay: .01, radius: 3, spread: true, power: .05 });
  game.step(.02, still);
  expect(neighbor.hp).toBeCloseTo(997.9);
  expect(game.bombs).toHaveLength(0);
});
test('Flashpoint leaves the hand-cast bomb’s stored ignite alone but can use a target reached by a copy', () => {
  const game = arena('fire', .5, [[0, 4], [1.7, 4]]);
  const [first, second] = game.enemies;
  const light = (amount: number) => ({ remaining: amount, next: 1, ticks: 4, sources: new Map([['fireball' as const, amount]]) });
  first.ignite = light(80);
  second.ignite = light(50);
  game.spells.add('livingBomb').add('flashpoint');
  expect(game.cast('livingBomb', null, still)).toBe(true);
  game.bombs.push({ x: second.x, z: second.z, target: second, delay: 1, radius: 3, spread: true, power: .3 });
  expect(game.cast('flashpoint', null, still)).toBe(true);
  expect(first.ignite.remaining).toBe(80);
  expect(second.ignite).toBeUndefined();
});

test('Living Bomb keeps bouncing between surviving enemies without a hop limit', () => {
  const game = arena('fire', .5, [[0, 4], [2.5, 4]]);
  const [first, second] = game.enemies;
  game.spells.add('livingBomb');
  game.perks['bomb-spread'] = 10;
  expect(game.cast('livingBomb', null, still)).toBe(true);
  game.cooldown.livingBomb = 999;
  for (const target of [second, first, second, first, second, first, second, first]) {
    advance(game, 1.31);
    expect(game.bombs).toHaveLength(1);
    expect(game.bombs[0].target).toBe(target);
    expect(game.bombs[0].power).toBe(1);
  }
  game.enemies = [first];
  advance(game, 1.31);
  expect(first.hp).toBeGreaterThan(0);
  expect(game.bombs).toHaveLength(0);
});

test('both barriers pulse only while they have absorption remaining, and the fire aura can be upgraded', () => {
  for (const [id, spell] of [['frost', 'barrier'], ['fire', 'fireBarrier']] as const) {
    const game = arena(id, .5, [[0, 2.45], [4.2, 0]]);
    game.spells.add(spell);
    game.perks['fire-ward-power'] = 2;
    game.cast(spell, null, still);
    expect(game.barrier).toBe(spell === 'fireBarrier' ? FIRE_BARRIER.absorption : 36);
    advance(game, .2);
    expect(game.enemies[1].hp).toBe(1000);
    if (id === 'frost') expect(game.enemies[0].slowPower).toBe(.34);
    else expect(game.enemies[0].hp).toBe(988);
    advance(game, .9);
    expect(game.events.filter((event) => event.kind === 'spell-impact' && event.spell === spell)).toHaveLength(2);
    game.hazards.push({ ...still, radius: 1, damage: game.barrier, windup: 1, delay: .01 });
    advance(game, .95);
    expect(game.barrier).toBe(0);
    expect(game.events.filter((event) => event.kind === 'spell-impact' && event.spell === spell)).toHaveLength(2);
  }
});

test('Blazing Barrier absorption extends the defense window without blocking the first overflow', () => {
  const game = arena('fire', .5, []);
  game.spells.add('fireBarrier');
  game.hazards.push({ ...still, radius: 1, damage: 70, delay: .01, windup: 1 });
  game.step(.02, still);
  expect(game.hp).toBe(100 - (70 - FIRE_BARRIER.absorption));
  expect(game.player.immunity).toBe(FIRE_BARRIER.guardTime);
  game.hazards.push({ ...still, radius: 1, damage: 15, delay: 1.03, windup: 1.03 });
  advance(game, 1.1);
  expect(game.hp).toBe(100 - (70 - FIRE_BARRIER.absorption));
});

test('frost upgrades improve each slow and increase damage only against frozen targets', () => {
  const game = arena();
  Object.assign(game.perks, { 'bolt-chill': 1, 'blizzard-chill': 5, 'frozen-power': 2 });
  const enemy = game.enemies[0];
  game.cooldown.bolt = 0;
  advance(game, .3);
  expect(enemy.slowPower).toBe(.51);
  expect(enemy.hp).toBe(979);
  game.spells.add('blizzard');
  game.cast('blizzard', null, still);
  advance(game, .13);
  expect(enemy.slowPower).toBe(.67);
  expect(enemy.hp).toBe(971);
  enemy.frozen = 2;
  advance(game, .46);
  expect(enemy.hp).toBe(961);
});

test('advanced spells exercise cold chains, delayed freezing, and different ways to make or spend ignite', () => {
  const cold = arena('frost', .5, [[0, 3], [1.1, 4], [-1.1, 4], [0, 5.6]]);
  cold.spells.add('frostChain').add('iceBloom').add('whiteout').add('winterMoon').add('absoluteZero');
  expect(cold.cast('frostChain', null, still)).toBe(true);
  expect(cold.enemies.every((e) => e.slow > 0)).toBe(true);
  expect(cold.cast('iceBloom', null, still)).toBe(true);
  expect(cold.impacts).toHaveLength(1);
  cold.cooldown.whiteout = cold.cooldown.winterMoon = cold.cooldown.absoluteZero = 100;
  advance(cold, .59);
  expect(cold.enemies.every((e) => e.frozen > 0)).toBe(true);
  for (const spell of ['whiteout', 'winterMoon', 'absoluteZero'] as const) {
    cold.cooldown[spell] = 0;
    expect(cold.cast(spell, null, still)).toBe(true);
  }
  expect(cold.storms[0].pulses).toBe(0);
  expect(cold.enemies.every((e) => e.frozen >= 3.6)).toBe(true);

  const fire = arena('fire', .5, [[0, 4], [0, 8], [.50, 11]]);
  fire.spells.add('emberFan').add('phoenix').add('supernova');
  expect(fire.cast('supernova', null, still)).toBe(false);
  expect(fire.cast('emberFan', null, still)).toBe(true);
  expect(fire.enemies[0].ignite?.remaining).toBeCloseTo(41 * ignition * 1.75);
  expect(fire.cast('phoenix', null, still)).toBe(true);
  fire.cooldown.supernova = 100;
  advance(fire, .75);
  expect(fire.enemies.every((e) => e.ignite)).toBe(true);
  fire.cooldown.supernova = 0;
  expect(fire.cast('supernova', null, still)).toBe(true);
  expect(fire.enemies.every((e) => !e.ignite)).toBe(true);
});

test('Rime Volley hits three paths only once each, and Frost Bind converts slow into a freeze', () => {
  const game = arena('frost', .5, [[0, 4], [1.24, 4], [-1.24, 4], [0, -8]]);
  game.spells.add('rimeVolley').add('frostBind');
  expect(game.cast('frostBind', null, still)).toBe(false);
  expect(game.cast('rimeVolley', null, still)).toBe(true);
  expect(game.enemies.map((e) => e.hp)).toEqual([973, 973, 973, 1000]);
  expect(game.enemies.map((e) => e.slow > 0)).toEqual([true, true, true, false]);
  expect(game.cast('frostBind', null, still)).toBe(true);
  expect(game.enemies[0]).toMatchObject({ frozen: 1.5, hp: 934 });
  expect(game.cooldown.frostBind).toBeCloseTo(3.6);
});

test('Frost Bind spreads only to nearby slowed targets in front and reclaims cooldown on a timely primary kill', () => {
  const game = arena('frost', .5, [[0, 1.2], [2, 1.2], [-1, -1], [0, 4]]);
  const [primary, secondary, rear, unslowed] = game.enemies;
  game.spells.add('frostBind').add('nova');
  Object.assign(game.perks, { 'frost-bind-spread': 2, 'frost-bind-reclaim': 2 });
  for (const enemy of [primary, secondary, rear]) enemy.slow = 2;
  expect(game.cast('frostBind', null, still)).toBe(true);
  expect(primary).toMatchObject({ hp: 961, frozen: 1.5 });
  expect(secondary).toMatchObject({ hp: 979, frozen: .85 });
  expect(rear.hp).toBe(1000);
  expect(unslowed.hp).toBe(1000);
  expect(game.cooldown.frostBind).toBeCloseTo(3.6);
  primary.hp = 1;
  secondary.hp = 1;
  expect(game.cast('nova', null, still)).toBe(true);
  expect(game.cooldown.frostBind).toBeCloseTo(2.4);
});

test('Frost Bind prioritizes a slowed boss charging in front and does not refund an expired mark', () => {
  const game = arena('frost', .5, [[0, 4], [0, 6]]);
  const [near, boss] = game.enemies;
  near.slow = boss.slow = 5;
  Object.assign(boss, { kind: 'stormRegent', bracing: true });
  game.spells.add('frostBind').add('lance');
  game.perks['frost-bind-reclaim'] = 2;
  expect(game.cast('frostBind', null, still)).toBe(true);
  expect(near.hp).toBe(1000);
  expect(boss.frozen).toBeCloseTo(.54);
  near.hp = 0;
  game.cooldown.lance = 999;
  advance(game, 2.52);
  boss.hp = 1;
  game.cooldown.lance = 0;
  expect(game.cast('lance', null, still)).toBe(true);
  advance(game, .30);
  expect(boss.hp).toBeLessThanOrEqual(0);
  expect(game.cooldown.frostBind).toBeCloseTo(.78);
});
test('directional non-projectile spells cannot spend a cooldown on rear-only targets', () => {
  const cold = arena('frost', .5, [[0, -4], [1, -4], [-1, -4]]);
  for (const enemy of cold.enemies) enemy.slow = 3;
  for (const spell of ['nova', 'lance', 'comet', 'blizzard', 'absoluteZero', 'glacierWall', 'frostBind', 'rimeVolley'] as const) {
    cold.spells.add(spell);
    expect(cold.cast(spell, spell === 'blizzard' ? { x: 0, z: -4 } : null, still)).toBe(false);
    expect(cold.cooldown[spell]).toBe(0);
  }
  expect(cold.enemies.map(({ hp }) => hp)).toEqual([1000, 1000, 1000]);

  const fire = arena('fire', .5, [[0, 1], [0, -1]]);
  fire.spells.add('fireBlast');
  expect(fire.cast('fireBlast', null, still)).toBe(true);
  expect(fire.enemies.map(({ hp }) => hp)).toEqual([960, 1000]);
});

test('Glacier Wall hits entrants once and Glacial Collapse spends clustered freezes', () => {
  const game = arena('frost', .5, [[0, 4], [2, 6], [-1.6, 6]]);
  const [first, second, third] = game.enemies;
  game.spells.add('glacierWall');
  expect(game.cast('glacierWall', null, still)).toBe(true);
  advance(game, .1);
  expect(first.hp).toBe(953);
  expect(second.hp).toBe(1000);
  second.z = 4.3;
  advance(game, .1);
  expect([first.hp, second.hp, third.hp]).toEqual([953, 953, 1000]);
  game.spells.add('glacialCollapse');
  expect(game.cast('glacialCollapse', null, still)).toBe(true);
  expect([first.hp, second.hp, third.hp]).toEqual([846, 846, 935]);
  expect(first.frozen + second.frozen).toBe(0);
  expect(first.slow).toBeGreaterThan(0);
});

test('Cinder Marks light five targets, and Ember Brand speeds up three burns without spending their damage', () => {
  const game = arena('fire', .5, [[0, 4], [1.7, 4], [-1.7, 4], [0, 6.5], [0, 9], [0, 11.5]]);
  const [first, second, third, fourth, fifth, sixth] = game.enemies;
  game.spells.add('cinderMarks').add('emberBrand');
  expect(game.cast('emberBrand', null, still)).toBe(false);
  expect(game.cast('cinderMarks', null, still)).toBe(true);
  expect([first, second, third, fourth, fifth].every((e) => e.ignite)).toBe(true);
  expect(sixth.ignite).toBeUndefined();
  const amount = CINDER_MARKS.damage * ignition * 1.7;
  expect(first.ignite?.remaining).toBeCloseTo(amount);
  expect(game.cast('emberBrand', null, still)).toBe(true);
  expect(game.spellDamage.get('emberBrand')).toBe(EMBER_BRAND.damage + 2 * EMBER_BRAND.secondaryDamage);
  expect(first.ignite?.remaining).toBeCloseTo(amount);
  advance(game, .43);
  for (const enemy of [first, second, third]) expect(enemy.ignite?.remaining).toBeCloseTo(amount * .75);
  for (const enemy of [fourth, fifth]) expect(enemy.ignite?.remaining).toBeCloseTo(amount);
  expect(game.spellDamage.get('cinderMarks')).toBeCloseTo(5 * CINDER_MARKS.damage + 3 * amount / 4);
});

test('Cinder Marks prioritizes fresh targets but does not idle when only burning targets remain', () => {
  const game = arena('fire', .5, [[0, 3], [1.7, 4], [-1.7, 4], [0, 6.5], [0, 9], [0, 11.5]]);
  game.spells.add('cinderMarks');
  const closest = game.enemies[0];
  closest.ignite = { remaining: 200, next: .4, ticks: 4, sources: new Map([['fireball', 200]]) };
  expect(game.cast('cinderMarks', null, still)).toBe(true);
  expect(closest.hp).toBe(1000);
  game.cooldown.cinderMarks = 0;
  expect(game.cast('cinderMarks', null, still)).toBe(true);
  expect(game.events.filter((event) => event.kind === 'strike' && event.spell === 'cinderMarks')).toHaveLength(10);
});

test('meteor windup, follow-along vortex, and Inferno Heart generate the expected new damage', () => {
  const fire = arena('fire', .5, [[0, 4], [1.8, 4], [-1.8, 4]]);
  fire.spells.add('meteor').add('infernoHeart');
  expect(fire.cast('infernoHeart', null, still)).toBe(true);
  expect(fire.inferno).toBe(6);
  const boost = INFERNO_BURN_BOOST_PERCENT / 100;
  const stored = 146 * ignition * (1 + boost);
  expect(fire.enemies[0].ignite?.remaining).toBeCloseTo(stored);
  expect(fire.cast('meteor', null, still)).toBe(true);
  advance(fire, .50);
  expect(fire.enemies[0].hp).toBe(854);
  advance(fire, .26);
  expect(fire.enemies[0].hp).toBe(786);
  const burn = fire.enemies[0].ignite!;
  expect(burn.remaining).toBeCloseTo(stored + 68 * ignition * (1 + boost));
  expect(burn.sources.get('infernoHeart')).toBeCloseTo(stored + 68 * ignition * boost);
  expect(burn.sources.get('meteor')).toBeCloseTo(68 * ignition);
  advance(fire, .13);
  expect(fire.spellDamage.get('infernoHeart')).toBeCloseTo(3 * (146 + (stored + 68 * ignition * boost) / 4));

  const vortex = arena('fire', .5, [[0, 4.9], [8, 4.9], [8, -2.5]]);
  vortex.spells.add('cinderVortex');
  expect(vortex.cast('cinderVortex', null, still)).toBe(true);
  advance(vortex, .15);
  const fresh = 1000 - CINDER_VORTEX.freshDamage;
  expect(vortex.enemies.map((e) => e.hp)).toEqual([fresh, 1000, 1000]);
  expect(vortex.storms[0]).toMatchObject({ radius: CINDER_VORTEX.reach, maxLife: CINDER_VORTEX.duration });
  vortex.player.x = 8;
  advance(vortex, .66);
  expect(vortex.storms[0].x).toBe(8);
  expect(vortex.enemies.map((e) => e.hp)).toEqual([fresh, fresh, 1000]);
  advance(vortex, .57);
  expect(vortex.enemies[1].hp).toBe(fresh - CINDER_VORTEX.burningDamage);
  expect(vortex.enemies[1].ignite?.remaining).toBeCloseTo(CINDER_VORTEX.freshDamage * ignition);
});

test('Frozen Orb grows after dealing damage, reaches new targets on later pulses and resets each cast', () => {
  const game = arena('frost', .5, [[0, 4], [2.05, 4]]);
  game.spells.add('orb');
  expect(game.cast('orb', null, still)).toBe(true);
  const [orb] = game.orbs, [center, edge] = game.enemies;
  Object.assign(orb, { x: 0, z: 4, vx: 0, vz: 0, age: 0, tick: 0 });
  game.step(.02, still);
  expect(center.hp).toBe(984);
  expect(edge.hp).toBe(1000);
  expect(orb.radius).toBeCloseTo(FROZEN_ORB.radius * 1.04);
  game.step(.28, still);
  expect(edge.hp).toBe(984);
  expect(orb.radius).toBeCloseTo(FROZEN_ORB.radius * 1.12);
  for (let i = 0; i < 7; i++) game.step(.28, still);
  expect(orb.radius).toBeCloseTo(FROZEN_ORB.radius * 1.60);
  game.cooldown.orb = 0;
  expect(game.cast('orb', null, still)).toBe(true);
  expect(game.orbs[1].radius).toBe(FROZEN_ORB.radius);
});

test('the Inferno Heart reward requires the learned spell and adds 10% of the base duration per rank', () => {
  const game = arena('fire');
  game.enemies[0].kind = 'warden';
  const card = UPGRADES.find(({ id }) => id === 'inferno-heart-duration')!;
  expect(game['canUpgrade'](card)).toBe(false);
  game.spells.add('infernoHeart');
  expect(game['canUpgrade'](card)).toBe(true);
  for (const duration of [6.6, 7.2]) {
    game.status = 'upgrade';
    game.choices = [card];
    expect(game.choose(card.id)).toBe(true);
    game.cooldown.infernoHeart = 0;
    expect(game.cast('infernoHeart', null, still)).toBe(true);
    expect(game.inferno).toBeCloseTo(duration);
  }
  advance(game, 6.4);
  expect(game.inferno).toBeCloseTo(.8);
  advance(game, .82);
  expect(game.inferno).toBe(0);
});

test('Crimson Supernova has a base wave and only adds part of a large stored ignite pool', () => {
  const game = arena('fire', .5, [[0, 4], [1, 4]]);
  const [first, second] = game.enemies;
  for (const enemy of game.enemies) enemy.ignite = { remaining: 200, next: 1, ticks: 4, sources: new Map([['fireball', 200]]) };
  game.spells.add('supernova');
  expect(game.cast('supernova', null, still)).toBe(true);
  const damage = 78 + 180 * .44 + 220 * .16;
  expect(first.hp).toBeCloseTo(1000 - damage);
  expect(second.hp).toBeCloseTo(1000 - damage);
  expect(game.spellDamage.get('supernova')).toBeCloseTo(2 * damage);
  expect(first.ignite ?? second.ignite).toBeUndefined();
});

test('late waves substantially increase spawn HP while movement speed grows by a smaller factor', () => {
  const opening = new Combat([], () => .5).enemies[0];
  const late = new Combat([], () => .5);
  late.enemies.length = 0;
  late.time = STAGE_TIME * STAGES.findIndex(({ id }) => id === 'abyss') + WAVE_TIME * (WAVE_COUNT - 1) - .01;
  late.step(.70, still);
  const mob = late.enemies.find(({ kind }) => kind === 'bloom')!;
  expect(mob.maxHp).toBe(Math.round(162 * 3.55 * 1.46));
  expect(mob.speed / 2.18).toBeCloseTo(1.136);
  expect(opening.maxHp).toBe(27);
  expect(opening.speed).toBeCloseTo(1.95);
  expect(late.enemies.find(({ kind }) => kind === 'leviathan')?.maxHp).toBe(14_400);
});

function bossRound(stage: number) {
  const game = arena();
  game.time = stage * STAGE_TIME + WAVE_TIME * (WAVE_COUNT - 1) - .01;
  game.step(.02, still);
  const boss = game.enemies.find(({ kind }) => kind === STAGES[stage].boss.kind)!;
  game.enemies = [boss];
  Object.assign(boss, { x: 0, z: -8, speed: 0, attackAt: game.time });
  game.step(.02, still);
  return { game, boss };
}

test('the clockwork boss alternates a straight line of five circles with a cross', () => {
  const { game, boss } = bossRound(5);
  expect(boss.hp).toBeGreaterThan(2150);
  expect(game.hazards).toHaveLength(5);
  expect(game.hazards.every((mark) => mark.cue === 'gearLine')).toBe(true);
  const center = game.hazards[2], spacing = game.hazards[3].z - center.z;
  expect(spacing).toBeGreaterThan(0);
  for (const [index, mark] of game.hazards.entries()) {
    expect(mark.x).toBeCloseTo(center.x);
    expect(mark.z - center.z).toBeCloseTo((index - 2) * spacing);
    expect(Math.hypot(mark.x, mark.z) + mark.radius).toBeLessThanOrEqual(game.moveSpeed * mark.windup + 1e-6);
  }
  game.hazards = [];
  boss.attackAt = game.time;
  game.step(.02, still);
  expect(game.hazards.some((mark) => Math.abs(mark.x - game.hazards[0].x) > 2)).toBe(true);
  expect(game.hazards.every((mark) => mark.cue === 'gearCross')).toBe(true);
});

test('abyss warnings acquire the moving player later, then remain fixed before each staggered hit', () => {
  const { game, boss } = bossRound(6);
  expect(boss.hp).toBeGreaterThan(2840);
  expect(game.hazards).toHaveLength(6);
  const [first, second, third] = game.hazards;
  expect(second.cue).toBe('abyssTrack');
  expect(first.follow).toBeUndefined();
  expect(second.follow).toBeDefined();
  const oldCenter = [second.x, second.z];
  game.player.x = 7;
  Object.assign(game.player, { slow: 2, slowPercent: 30 });
  advance(game, .46);
  expect(second.follow).toBeUndefined();
  expect(second.x - oldCenter[0]).toBeGreaterThan(5);
  expect(Math.hypot(second.x - game.player.x, second.z - game.player.z) + second.radius)
    .toBeLessThanOrEqual(game.moveSpeed * second.windup + 1e-6);
  expect(third.follow).toBeDefined();
  const fixed = second.x;
  game.player.x = -7;
  advance(game, .51);
  expect(second.x).toBe(fixed);
  expect(third.follow).toBeUndefined();
  expect(Math.hypot(third.x - game.player.x, third.z - game.player.z) + third.radius)
    .toBeLessThanOrEqual(game.moveSpeed * third.windup + 1e-6);
  expect(first.delay).toBeLessThan(second.delay);
  expect(second.delay).toBeLessThan(third.delay);
  advance(game, second.delay + .02);
  expect(game.events).toContainEqual({ kind: 'enemy-blast', x: fixed, z: second.z, radius: second.radius, cue: second.cue });
});
