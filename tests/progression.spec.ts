import { expect, test } from '@playwright/test';
import { Combat } from '../src/combat';
import { COOLDOWNS, STAGES, STAGE_TIME, WAVE_TIME } from '../src/data';
import {
  PERMANENT_MAX_RANK, addStagePoints, buyPermanent, loadProgression, permanentBonuses, permanentPrice, stagePoints,
} from '../src/progression';

const still = { x: 0, z: 0 };

test('run rewards credit only completed stages and the final stage counts on victory', () => {
  const game = new Combat([], () => .5);
  expect(stagePoints(game.clearedStages)).toBe(0);
  game.time = STAGE_TIME * 2 - .01;
  game.step(.02, still);
  game.status = 'lost';
  expect(stagePoints(game.clearedStages)).toBe(20);
  expect(addStagePoints(loadProgression(''), game.clearedStages).points).toBe(20);
  game.stageIndex = STAGES.length - 1;
  game.status = 'won';
  expect(stagePoints(game.clearedStages)).toBe(STAGES.length * 10);
});

test('upgrade prices rise per stat, purchases reject insufficient funds and ranks are capped', () => {
  expect(Array.from({ length: 5 }, (_, rank) => permanentPrice(rank))).toEqual([10, 16, 26, 41, 66]);
  const funds = addStagePoints(loadProgression(''), 2);
  const once = buyPermanent(funds, 'damage')!;
  expect(funds.points).toBe(20);
  expect(once.points).toBe(10);
  expect(once.ranks.damage).toBe(1);
  expect(buyPermanent(once, 'damage')).toBeNull();
  const twoStats = buyPermanent(once, 'cooldown')!;
  expect(twoStats.ranks).toMatchObject({ damage: 1, cooldown: 1 });
  expect(twoStats.points).toBe(0);
  expect(loadProgression(JSON.stringify(twoStats))).toEqual(twoStats);

  const maxed = loadProgression(JSON.stringify({ version: 1, points: 9000, ranks: { damage: 99 } }));
  expect(maxed.ranks.damage).toBe(PERMANENT_MAX_RANK);
  expect(buyPermanent(maxed, 'damage')).toBeNull();
  expect(loadProgression('invalid save').points).toBe(0);
  expect(loadProgression('{"version":1,"points":-15,"ranks":{"speed":2.9}}').ranks.speed).toBe(0);
});

test('both classes receive stored damage and cooldown bonuses, and movement and pickup radius change in combat', () => {
  const ranks = { ...loadProgression('').ranks, damage: 2, cooldown: 2, pickup: 2, speed: 2 };
  expect(permanentBonuses(ranks)).toMatchObject({ damage: 1.06, cooldown: .96, pickup: 1.16, speed: 1.04, xp: 1 });
  for (const [mageClass, starter, damage] of [['frost', 'bolt', 22], ['fire', 'fireball', 24]] as const) {
    const game = new Combat([], () => .5, undefined, mageClass, ranks);
    game.player.heading = 0;
    Object.assign(game.enemies[0], { x: 0, z: 3, hp: 100, speed: 0 });
    game.enemies.length = 1;
    for (let i = 0; i < 15; i++) game.step(.02, still);
    expect(game.enemies[0].hp).toBe(100 - damage);
    expect(game.limits[starter]).toBeCloseTo(COOLDOWNS[starter] * .96);
    const defense = mageClass === 'frost' ? 'barrier' : 'fireBarrier';
    game.spells.add(defense);
    expect(game.cast(defense, null, still)).toBe(true);
    expect(game.cooldown[defense]).toBeCloseTo(COOLDOWNS[defense] * .96);

    game.enemies.length = 0;
    game.step(.1, { x: 0, z: 1 });
    expect(game.player.z).toBeCloseTo(5.35 * 1.04 * .1);
    for (const [tier, range] of [['normal', 3.3], ['boss', 5.3]] as const) {
      const gem = { x: range, z: game.player.z, age: 1, value: 3, phase: 0, tier };
      game.pickups.push(gem);
      game.step(.02, still);
      expect(gem.x).toBeLessThan(range);
    }
  }
});

test('defensive ranks improve starting health and the heal between waves', () => {
  const ranks = { ...loadProgression('').ranks, health: 2, recovery: 2 };
  const game = new Combat([], () => .5, undefined, 'fire', ranks);
  expect(game.hp).toBe(110);
  expect(game.maxHp).toBe(110);
  expect(game.waveRecovery).toBe(18);
  game.hp = 64;
  game.time = WAVE_TIME - .01;
  game.step(.02, still);
  expect(game.hp).toBe(82);
});

test('XP upgrades preserve old saves and accumulate the bonus from small gems', () => {
  const oldSave = loadProgression('{"version":1,"points":20,"ranks":{"damage":1}}');
  expect(oldSave.ranks).toMatchObject({ xp: 0, damage: 1, regeneration: 0, 'status-time': 0 });
  const upgraded = buyPermanent(oldSave, 'xp')!;
  expect(upgraded.ranks.xp).toBe(1);
  expect(upgraded.points).toBe(10);
  const game = new Combat([], () => .5, undefined, 'frost', upgraded.ranks);
  game.enemies.length = 0;
  game.level = 5;
  for (const expected of [3, 6, 9, 12, 15, 18, 22]) {
    game.pickups.push({ x: 0, z: 0, age: 1, value: 3, phase: 0, tier: 'normal' });
    game.step(.02, still);
    expect(game.xp).toBe(expected);
  }
});

test('permanent half-second ranks combine with common ranks without passing the run caps', () => {
  const ranks = { ...loadProgression('').ranks, regeneration: 5, 'status-time': 3 };
  expect(permanentBonuses(ranks)).toMatchObject({ regeneration: 2.5, 'status-time': 1.5 });
  const game = new Combat([], () => .5, undefined, 'frost', ranks);
  game.enemies.length = 1;
  Object.assign(game.enemies[0], { x: 0, z: 3, speed: 0, hp: 1000 });
  Object.assign(game, { nextSpawn: Infinity });
  game.cooldown.bolt = 1000;
  game.player.heading = 0;
  game.spells.add('nova');
  expect(game.cast('nova', null, still)).toBe(true);
  expect(game.enemies[0].frozen).toBeCloseTo(3.9);

  game.hp = 40;
  expect(game.recoveryInterval).toBe(7.5);
  game.step(7.48, still);
  expect(game.hp).toBe(40);
  game.step(.02, still);
  expect(game.hp).toBe(41);
  game.gold = 30;
  game.perks.regeneration = 6;
  expect(game.recoveryInterval).toBe(1.5);
  expect(game.buyCommonTalent('regeneration')).toBe(true);
  expect(game.recoveryInterval).toBe(1);
  expect(game.buyCommonTalent('regeneration')).toBe(false);
  game.perks['status-time'] = 3;
  expect(game.buyCommonTalent('status-time')).toBe(true);
  expect(game.buyCommonTalent('status-time')).toBe(false);
  game.cooldown.nova = 0;
  expect(game.cast('nova', null, still)).toBe(true);
  expect(game.enemies[0].frozen).toBeCloseTo(7.4);
});
