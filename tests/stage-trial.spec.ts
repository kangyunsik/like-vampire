import { expect, test } from '@playwright/test';
import { Combat } from '../src/combat';
import { STAGE_TIME, WAVE_COUNT, WAVE_TIME } from '../src/data';
import { prepareStageTrial, stageTrial } from '../src/stage-trial';

test('stage practice validates stage numbers and limits the chain loadout to Frost past stage one', () => {
  expect(() => stageTrial(0, 'balanced', 'frost')).toThrow(RangeError);
  expect(() => stageTrial(8.5, 'balanced', 'frost')).toThrow(RangeError);
  expect(() => stageTrial(11, 'balanced', 'frost')).toThrow(RangeError);
  expect(() => stageTrial(8, 'anything', 'frost')).toThrow('balanced');
  expect(() => stageTrial(1, 'chain', 'frost')).toThrow('2스테이지');
  expect(() => stageTrial(8, 'chain', 'fire')).toThrow('냉기');

  const run = new Combat();
  prepareStageTrial(run, stageTrial(2, 'chain', 'frost'));
  expect([...run.spells]).toEqual(['bolt', 'blizzard', 'frostChain', 'whiteout', 'chainLightning']);
  expect(run.perks['chain-lightning-links']).toBe(1);
  expect(run.perks['frost-chain-links']).toBe(1);
});

test('late practice uses the stage wave roster and boss, not the four introductory enemies', () => {
  const run = new Combat([], () => .5, () => false, 'fire');
  prepareStageTrial(run, stageTrial(10, 'balanced', 'fire'));
  expect(run).toMatchObject({ time: 9 * STAGE_TIME, level: 87, wave: 1, kills: 0 });
  expect(run.spells.has('fireball')).toBe(true);
  expect(run.spells.has('chainLightning')).toBe(false);
  expect(run.enemies).toHaveLength(0);

  const still = { x: 0, z: 0 };
  run.step(.7, still);
  expect(run.enemies).toHaveLength(4);
  expect(run.enemies.every(({ kind }) => run.stage.pools[0].some(([member]) => member === kind))).toBe(true);
  run.time = 9 * STAGE_TIME + (WAVE_COUNT - 1) * WAVE_TIME;
  run.step(.02, still);
  expect(run.events).toContainEqual({ kind: 'boss', boss: run.stage.boss.kind });
});
