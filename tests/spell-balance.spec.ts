import { expect, test } from '@playwright/test';
import { Combat } from '../src/combat';
import { CHAIN_LIGHTNING, COOLDOWNS, UPGRADES } from '../src/data';

const still = { x: 0, z: 0 };
const hopDelay = CHAIN_LIGHTNING.hopDelay;
const hops = (run: Combat) => run.events.filter((event) => event.kind === 'chain-lightning-hit');
function arena(positions: readonly (readonly [number, number])[], roll = .5) {
  const run = new Combat([], () => roll);
  const template = run.enemies[0];
  run.enemies = positions.map(([x, z], index) => ({ ...template, id: 120 + index, x, z, speed: 0, hp: 1000, maxHp: 1000 }));
  run.player.heading = 0;
  run.cooldown.bolt = 999;
  Object.assign(run, { nextSpawn: Infinity });
  return run;
}

test('Chain Lightning emits one immediate hit then timed bounces, consuming chill only at contact', () => {
  const run = arena([[0, 14], [0, 17.8], [0, 21.6]]);
  run.spells.add('chainLightning');
  run.enemies[0].slow = 4;
  run.enemies[0].chills = { bolt: { time: 4, power: .47 }, blizzard: { time: 2, power: .62 } };
  Object.assign(run.enemies[1], { frozen: 3, freezeSource: 'nova', slow: 2 });
  expect(run.cast('chainLightning', null, still)).toBe(true);
  expect(run.cooldown.chainLightning).toBe(COOLDOWNS.chainLightning);
  expect(run.enemies.map((enemy) => 1000 - enemy.hp)).toEqual([232, 0, 0]);
  expect(hops(run)).toMatchObject([{ hop: 0, consumedChill: true }]);
  run.step(hopDelay - .005, still);
  expect(hops(run)).toHaveLength(1);
  expect(run.enemies[1].frozen).toBeGreaterThan(0);
  run.step(.006, still);
  expect(run.enemies.map((enemy) => 1000 - enemy.hp)).toEqual([232, 209, 0]);
  run.step(hopDelay, still);
  expect(run.enemies.map((enemy) => 1000 - enemy.hp)).toEqual([232, 209, 94]);
  expect(run.enemies.every((enemy) => !enemy.slow && !enemy.frozen && !enemy.chills && !enemy.freezeSource)).toBe(true);
  expect(run.spellDamage.get('chainLightning')).toBe(535);
  expect(hops(run)).toMatchObject([{ hop: 0, consumedChill: true }, { hop: 1, consumedChill: true }, { hop: 2, consumedChill: false }]);
  expect(run.events.filter(({ kind }) => kind === 'cast' || kind === 'chain-lightning-hit' || kind === 'strike').map(({ kind }) => kind))
    .toEqual(['cast', 'chain-lightning-hit', 'strike', 'chain-lightning-hit', 'strike', 'chain-lightning-hit', 'strike']);
});

for (const [rank, mitigation, multiplier, hits] of [[0, 0, 2, 11], [1, 1, 2.5, 13], [3, 5, 3, 17]] as const) {
  test(`Chain Lightning rank ${rank} caps distinct targets at ${hits} with the configured falloff and multiplier`, () => {
    const run = arena(Array.from({ length: 18 }, (_, i) => [0, 14 + i * 3.85] as const));
    run.spells.add('chainLightning');
    Object.assign(run.perks, { 'chain-lightning-links': rank, 'chain-lightning-loss': mitigation, 'chain-lightning-amplify': rank > 2 ? 2 : rank });
    run.enemies.forEach((enemy) => { enemy.slow = 2; });
    expect(run.cast('chainLightning', null, still)).toBe(true);
    for (let i = 0; i < hits + 1; i++) run.step(hopDelay, still);
    expect(hops(run).map(({ hop, x, z }) => [hop, x, z])).toEqual(run.enemies.slice(0, hits).map(({ x, z }, i) => [i, x, z]));
    const damage = run.enemies.map((enemy) => 1000 - enemy.hp);
    expect(damage.slice(0, hits)).toEqual(Array.from({ length: hits }, (_, i) =>
      Math.round(CHAIN_LIGHTNING.damage * (1 - (CHAIN_LIGHTNING.loss - mitigation * CHAIN_LIGHTNING.mitigation) / 100) ** i * multiplier)));
    expect(damage.slice(hits)).toEqual(Array(18 - hits).fill(0));
  });
}

test('Chain Lightning cannot jump behind the mage and its own critical hits never reapply the consumed slow', () => {
  const run = arena([[0, 1], [2.2, 2], [0, -1.5]], 0);
  run.spells.add('chainLightning');
  run.enemies.forEach((enemy) => { enemy.slow = 2; });
  expect(run.cast('chainLightning', null, still)).toBe(true);
  run.player.heading = Math.PI;
  run.step(hopDelay * 3, still);
  expect(run.enemies.slice(0, 2).map((enemy) => enemy.slow)).toEqual([0, 0]);
  expect(run.enemies[2].slow).toBeGreaterThan(0);
  expect(run.enemies[2].hp).toBe(1000);
  expect(run.events.filter((event) => event.kind === 'strike').every((event) => event.critical)).toBe(true);
  expect(run.lightningCharge).toBe(false);
});

test('Chain Lightning jumps to a chilled target ahead of a similarly close untouched one', () => {
  const run = arena([[0, 14], [2, 15.8], [-2.4, 15.9]]);
  run.spells.add('chainLightning');
  run.enemies[2].slow = 2;
  expect(run.cast('chainLightning', null, still)).toBe(true);
  run.step(hopDelay * 2 + .001, still);
  expect(hops(run)).toMatchObject([
    { x: 0, z: 14, from: { x: 0, z: 0 }, consumedChill: false },
    { x: -2.4, z: 15.9, from: { x: 0, z: 14 }, consumedChill: true },
    { x: 2, z: 15.8, from: { x: -2.4, z: 15.9 }, consumedChill: false },
  ]);
});

test('successful crits from other spells charge once, and a failed cast keeps the next-cast bonus', () => {
  const run = arena([[0, 3], [1.8, 3]], 0);
  run.enemies[0].hp = 1; // Even a killing crit contributes.
  run.spells.add('chainLightning').add('frostGale');
  expect(run.cast('frostGale', null, still)).toBe(true);
  expect(run.events.filter(({ kind }) => kind === 'lightning-charge')).toHaveLength(1);
  expect(run.lightningCharge).toBe(true);

  run.enemies = arena([[0, 9], [1.9, 10]]).enemies;
  Object.assign(run, { rng: () => .5 });
  run.player.heading = Math.PI;
  expect(run.cast('chainLightning', null, still)).toBe(false);
  expect(run.lightningCharge).toBe(true);
  run.player.heading = 0;
  expect(run.cast('chainLightning', null, still)).toBe(true);
  expect(run.lightningCharge).toBe(false);
  run.step(hopDelay * 2, still);
  expect(hops(run)).toMatchObject([{ hop: 0, charged: true }, { hop: 1, charged: true }]);
  expect(run.enemies.map(({ hp }) => 1000 - hp)).toEqual([139, 125]);
  expect(run.lightningCharge).toBe(false);
});

test('automatic chains apply slow first and fire before Aurora Strike without turning the mage', () => {
  const run = arena([[0, 7], [1.5, 7], [2.9, 7]]);
  run.spells.add('auroraStrike').add('chainLightning').add('frostChain');
  run.step(.01, still);
  run.step(.34, still);
  run.step(hopDelay * 2, still);
  expect(run.events.filter((event) => event.kind === 'cast')).toMatchObject([{ spell: 'frostChain' }, { spell: 'chainLightning' }]);
  expect(hops(run)).toHaveLength(3);
  expect(hops(run).every(({ consumedChill }) => consumedChill)).toBe(true);
  expect(run.player.heading).toBe(0);
});

test('Rime Chain gains two distinct chilled targets per upgrade', () => {
  for (const rank of [0, 1, 3]) {
    const run = arena(Array.from({ length: 12 }, (_, i) => [0, 3 + i * 2.5] as const));
    run.spells.add('frostChain');
    run.perks['frost-chain-links'] = rank;
    expect(run.cast('frostChain', null, still)).toBe(true);
    expect(run.enemies.filter((enemy) => enemy.slow === 2.4)).toHaveLength(4 + rank * 2);
    expect(run.events.filter((event) => event.kind === 'strike')).toHaveLength(4 + rank * 2);
  }
});

test('Rime Chain prefers linked targets over an isolated one and slows each hit across wider gaps', () => {
  const run = arena([[0, 2], [4, 10], [.5, 11.7], [2, 13.5], [0, -.2]]);
  run.spells.add('frostChain');
  expect(run.cast('frostChain', null, still)).toBe(true);
  expect(run.enemies.map(({ hp }) => 1000 - hp)).toEqual([0, 50, 46, 42, 0]);
  expect(run.enemies.map(({ slow }) => slow)).toEqual([0, 2.4, 2.4, 2.4, 0]);
});

test('Absolute Zero deals stronger damage to already-chilled targets without giving up its freeze', () => {
  const run = arena([[0, 3], [2, 4], [-2, 5.5]]);
  run.spells.add('absoluteZero');
  run.enemies[0].slow = 4;
  run.enemies[1].frozen = 2;
  expect(run.cast('absoluteZero', null, still)).toBe(true);
  expect(run.enemies.map(({ hp }) => 1000 - hp)).toEqual([135, 135, 90]);
  expect(run.enemies.every((enemy) => enemy.frozen === 3.6 && enemy.freezeSource === 'absoluteZero')).toBe(true);
  expect(run.enemies[0].slow).toBe(4);
  expect(run.cooldown.absoluteZero).toBe(21);
});

test('Glacier Wall size and duration increase independently of its damage', () => {
  expect(UPGRADES.filter((card) => 'requires' in card && card.requires === 'glacierWall').map(({ id }) => id))
    .toEqual(['glacier-wall-life', 'glacier-wall-size']);
  for (const rank of [0, 2]) {
    const run = arena([[0, 5]]);
    run.spells.add('glacierWall');
    Object.assign(run.perks, { 'glacier-wall-life': rank, 'glacier-wall-size': rank });
    expect(run.cast('glacierWall', null, still)).toBe(true);
    const [wall] = run.walls;
    expect(wall.life).toBe(3 + rank);
    expect(wall.maxLife).toBe(wall.life);
    expect(wall.width).toBeCloseTo(.53 * (1 + .2 * rank));
    expect(Math.hypot(wall.to.x - wall.from.x, wall.to.z - wall.from.z)).toBeCloseTo(6.4 * (1 + .2 * rank));
    run.step(.02, still);
    expect(run.enemies[0]).toMatchObject({ hp: 953, freezeSource: 'glacierWall' });
    run.step(3.1, still);
    expect(run.walls.length).toBe(rank ? 1 : 0);
  }
});

test('Frost Gale prepares several targets for combos while Aurora Strike prioritizes a boss', () => {
  const run = arena([[0, 4], [2, 4], [0, -3], [5, 10], [7, 10]]);
  Object.assign(run.enemies[3], { kind: 'warden' });
  run.spells.add('frostGale').add('auroraStrike');
  expect(run.cast('frostGale', null, still)).toBe(true);
  expect(run.enemies.map(({ slow }) => slow)).toEqual([2, 2, 0, 0, 0]);
  expect(run.cast('auroraStrike', null, still)).toBe(true);
  expect(run.enemies.map(({ hp }) => 1000 - hp)).toEqual([42, 42, 0, 154, 51]);
});
