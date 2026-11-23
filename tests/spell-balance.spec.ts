import { expect, test } from '@playwright/test';
import { Combat } from '../src/combat';
import { CHAIN_LIGHTNING, COOLDOWNS, UPGRADES } from '../src/data';

const still = { x: 0, z: 0 };
function arena(positions: readonly (readonly [number, number])[], roll = .5) {
  const run = new Combat([], () => roll);
  const template = run.enemies[0];
  run.enemies = positions.map(([x, z], index) => ({ ...template, id: 120 + index, x, z, speed: 0, hp: 1000, maxHp: 1000 }));
  run.player.heading = 0;
  run.cooldown.bolt = 999;
  Object.assign(run, { nextSpawn: Infinity });
  return run;
}

test('Chain Lightning clears the entire chill on each boosted hit and counts falloff by bounce', () => {
  const run = arena([[0, 14], [0, 17.8], [0, 21.6]]);
  run.spells.add('chainLightning');
  run.enemies[0].slow = 4;
  run.enemies[0].chills = { bolt: { time: 4, power: .47 }, blizzard: { time: 2, power: .62 } };
  Object.assign(run.enemies[1], { frozen: 3, freezeSource: 'nova', slow: 2 });
  expect(run.cast('chainLightning', null, still)).toBe(true);
  expect(run.enemies.map((enemy) => 1000 - enemy.hp)).toEqual([184, 166, 75]);
  expect(run.enemies.every((enemy) => !enemy.slow && !enemy.frozen && !enemy.chills && !enemy.freezeSource)).toBe(true);
  expect(run.spellDamage.get('chainLightning')).toBe(425);
  expect(run.events).toContainEqual(expect.objectContaining({ kind: 'cast', spell: 'chainLightning', consumedChill: 2 }));
  expect(run.cooldown.chainLightning).toBeCloseTo(COOLDOWNS.chainLightning);
});

for (const [rank, mitigation, multiplier, hits] of [[0, 0, 2, 11], [1, 1, 2.5, 13], [3, 5, 3, 17]] as const) {
  test(`Chain Lightning rank ${rank} caps distinct targets at ${hits} with the configured falloff and multiplier`, () => {
    const run = arena(Array.from({ length: 18 }, (_, i) => [0, 14 + i * 3.85] as const));
    run.spells.add('chainLightning');
    Object.assign(run.perks, { 'chain-lightning-links': rank, 'chain-lightning-loss': mitigation, 'chain-lightning-amplify': rank > 2 ? 2 : rank });
    run.enemies.forEach((enemy) => { enemy.slow = 2; });
    expect(run.cast('chainLightning', null, still)).toBe(true);
    const cast = run.events.find((event) => event.kind === 'cast' && event.spell === 'chainLightning')!;
    expect(cast).toMatchObject({ kind: 'cast', spell: 'chainLightning', path: expect.any(Array) });
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
  expect(run.enemies.map((enemy) => enemy.slow)).toEqual([0, 0, 2]);
  expect(run.enemies[2].hp).toBe(1000);
  expect(run.events.filter((event) => event.kind === 'strike').every((event) => event.critical)).toBe(true);
});

test('Chain Lightning jumps to a chilled target ahead of a similarly close untouched one', () => {
  const run = arena([[0, 14], [2, 15.8], [-2.4, 15.9]]);
  run.spells.add('chainLightning');
  run.enemies[2].slow = 2;
  expect(run.cast('chainLightning', null, still)).toBe(true);
  expect(run.events).toContainEqual(expect.objectContaining({
    kind: 'cast', spell: 'chainLightning', consumedChill: 1,
    path: [{ x: 0, z: 0 }, { x: 0, z: 14 }, { x: -2.4, z: 15.9 }, { x: 2, z: 15.8 }],
  }));
});

test('automatic chains apply slow first and fire before Aurora Strike without turning the mage', () => {
  const run = arena([[0, 7], [1.5, 7], [2.9, 7]]);
  run.spells.add('auroraStrike').add('chainLightning').add('frostChain');
  run.step(.01, still);
  run.step(.34, still);
  expect(run.events.filter((event) => event.kind === 'cast')).toMatchObject([
    { spell: 'frostChain' }, { spell: 'chainLightning', consumedChill: 3 },
  ]);
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
