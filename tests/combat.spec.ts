import { expect, test } from '@playwright/test';
import { buildChoice, expeditionTarget, steering, turnTowardThreat, useExpedition } from '../scripts/balance-driver.mjs';
import { Combat } from '../src/combat';
import { COOLDOWNS, FIELD_X, FIELD_Z, PICKUP_STYLES, RUN_TIME, SPELL_LEARN_INTERVAL, SPELL_RARITY, SPELLS, STAGES, STAGE_TIME, UPGRADES, WAVE_COUNT, WAVE_TIME } from '../src/data';
import { wrapAxis } from '../src/field';

const still = { x: 0, z: 0 };
function advance(game: Combat, duration: number) {
  const frames = Math.ceil(duration / .02);
  for (let i = 0; i < frames; i++) game.step(duration / frames, still);
}

function levelUp(game: Combat, extra = 0) {
  game.pickups.push({ x: game.player.x, z: game.player.z, age: .2, phase: 0, value: game.goal + extra, tier: 'normal' });
  game.step(.02, still);
}

test('a run starts with only Frostbolt and locked spells cannot be cast', () => {
  const game = new Combat([], () => .5);
  expect([...game.spells]).toEqual(['bolt']);
  for (const { id } of SPELLS) {
    if (id === 'bolt') continue;
    expect(game.cast(id, null, still)).toBe(false);
    expect(game.cooldown[id]).toBe(0);
  }
  advance(game, .4);
  expect(game.events.filter((event) => event.kind === 'cast').every((event) => event.spell === 'bolt')).toBe(true);
});

test('frostbolt tracks a target, slows it, then drops an experience crystal on a kill', () => {
  const game = new Combat([], () => .5);
  game.player.heading = 0;
  game.enemies.length = 1;
  const enemy = game.enemies[0];
  Object.assign(enemy, { x: 0, z: 4 });
  advance(game, .4);
  expect(enemy.hp).toBe(6);
  expect(enemy.slow).toBeGreaterThan(1);
  expect(game.cooldown.bolt).toBeGreaterThan(0);
  advance(game, .9);
  expect(game.kills).toBe(1);
  expect(game.pickups).toHaveLength(1);
  advance(game, .85);
  expect(game.xp).toBe(3);
});

test('frost nova roots and doubles the lance hit; cooldowns prevent repeat casts', () => {
  const game = new Combat([], () => .5);
  game.player.heading = 0;
  game.spells.add('nova').add('lance');
  game.enemies.length = 1;
  const enemy = game.enemies[0];
  Object.assign(enemy, { x: 0, z: 3, hp: 110, speed: 0 });
  game.cooldown.bolt = 4;
  expect(game.cast('nova', null, still)).toBe(true);
  expect(game.cast('nova', null, still)).toBe(false);
  expect(enemy.frozen).toBe(2.4);
  expect(enemy.hp).toBe(92);
  expect(game.cast('lance', null, still)).toBe(true);
  advance(game, .20);
  expect(enemy.hp).toBe(26);
  expect(game.events).toContainEqual(expect.objectContaining({ kind: 'strike', damage: 66, frozen: true }));
});

test('Fingers of Frost charges are earned from Frostbolt and consumed by Ice Lance', () => {
  const game = new Combat([], () => .1);
  game.player.heading = 0;
  game.spells.add('lance');
  game.cooldown.lance = .5;
  game.enemies.length = 1;
  const enemy = game.enemies[0];
  Object.assign(enemy, { x: 0, z: 5, hp: 200, speed: 0 });
  game.perks.fingers = 1;
  advance(game, .4);
  expect(game.fingers).toBe(1);
  expect(enemy.frozen).toBe(0);
  advance(game, .4);
  expect(game.fingers).toBe(0);
  expect(game.cooldown.lance).toBeGreaterThan(0);
  expect(enemy.hp).toBe(113);
});

test('blizzard slows enemies in its circle and blink can cross the joined terrain', () => {
  const game = new Combat([], () => .5);
  game.player.heading = 0;
  game.spells.add('blizzard').add('blink');
  game.enemies.length = 1;
  const enemy = game.enemies[0];
  Object.assign(enemy, { x: 10, z: 3, hp: 150, speed: 0 });
  game.cooldown.bolt = 4;
  expect(game.cast('blizzard', { x: 10, z: 3 }, still)).toBe(true);
  expect(game.storms[0]).toMatchObject({ x: 10, z: 3, life: 4.5 });
  advance(game, .6);
  expect(enemy.hp).toBe(134);
  expect(enemy.slow).toBeGreaterThan(0);
  game.player.x = FIELD_X - 2;
  expect(game.cast('blink', null, { x: 1, z: 0 })).toBe(true);
  expect(game.player.x).toBeCloseTo(FIELD_X - 2 + 5.55);
  expect(game.player.immunity).toBeGreaterThan(0);
});

test('crystals open exactly three upgrades and pause the run until a valid choice', () => {
  const game = new Combat([], () => .5);
  game.pickups.push({ x: .16, z: .09, age: .2, phase: 0, value: game.goal, tier: 'normal' });
  game.step(.02, still);
  expect(game.status).toBe('upgrade');
  expect(game.level).toBe(2);
  expect(new Set(game.choices.map(({ id }) => id)).size).toBe(3);
  expect(game.choices.every((choice) => !('spell' in choice))).toBe(true);
  expect(game.choose('learn-nova')).toBe(false);
  const time = game.time;
  advance(game, 1);
  expect(game.time).toBe(time);
  const upgrade = game.choices[0];
  expect(game.choose(upgrade.id)).toBe(true);
  expect(game.status).toBe('playing');
  expect(game.perks[upgrade.id as keyof Combat['perks']]).toBe(1);
  expect(game.spells.size).toBe(1);
  expect(new Combat().spells.size).toBe(1);
  expect(game.choose(upgrade.id)).toBe(false);
});

test('only every fifth level offers spells, with no repeats and only eligible perks in between', () => {
  const game = new Combat([], () => .35);
  game.enemies.length = 0;
  for (let level = 2; level <= (SPELLS.length - 1) * SPELL_LEARN_INTERVAL; level++) {
    levelUp(game);
    expect(game.choices).toHaveLength(3);
    expect(new Set(game.choices.map((choice) => choice.id)).size).toBe(3);
    for (const choice of game.choices) {
      if ('spell' in choice) expect(game.spells.has(choice.spell)).toBe(false);
      else if ('requires' in choice) expect(game.spells.has(choice.requires)).toBe(true);
    }
    const learn = game.choices.find((choice) => 'spell' in choice);
    const milestone = level % SPELL_LEARN_INTERVAL === 0;
    expect(Boolean(learn)).toBe(milestone);
    expect(game.choose((learn ?? game.choices[0]).id)).toBe(true);
  }
  expect(game.spells.size).toBe(SPELLS.length);
  game.perks.shards = 7;
  game.perks.haste = 3;
  levelUp(game);
  expect(game.choices.every((choice) => !('spell' in choice))).toBe(true);
  expect(game.choices.some((choice) => choice.id === 'haste')).toBe(false);
  for (const choice of game.choices) {
    if (!('spell' in choice)) {
      const definition = UPGRADES.find((upgrade) => upgrade.id === choice.id)!;
      if (definition.max !== null) expect(game.perks[choice.id] ?? 0).toBeLessThan(definition.max);
    }
  }
});

test('surplus experience after a spell milestone queues an enhancement-only level', () => {
  const game = new Combat([], () => 0);
  game.enemies.length = 0;
  game.level = SPELL_LEARN_INTERVAL - 1;
  levelUp(game, 9 + (SPELL_LEARN_INTERVAL - 1) * 4);
  const choice = game.choices[0];
  expect(choice).toHaveProperty('spell');
  expect(game.choose(choice.id)).toBe(true);
  expect(game.level).toBe(SPELL_LEARN_INTERVAL + 1);
  expect(game.status).toBe('upgrade');
  expect(game.xp).toBe(0);
  expect(game.choices.every((candidate) => !('spell' in candidate))).toBe(true);
});

test('learned offensive spells do not spend cooldowns when no targets exist', () => {
  const game = new Combat([], () => .5);
  for (const spell of SPELLS) game.spells.add(spell.id);
  game.enemies.length = 0;
  game.step(.1, still);
  expect(Object.values(game.cooldown).every((value) => value === 0)).toBe(true);
  expect(game.events).toHaveLength(0);
  expect(game.shots).toHaveLength(0);
  expect(game.storms).toHaveLength(0);
  expect(game.orbs).toHaveLength(0);
  expect(game.comets).toHaveLength(0);
  expect(game.impacts).toHaveLength(0);
  expect(game.walls).toHaveLength(0);
});

test('the automatic ice barrier absorbs a hit and only excess damage reaches health', () => {
  const game = new Combat([], () => .5);
  game.spells.add('barrier');
  game.enemies.length = 0;
  const hit = (damage: number) => {
    game.player.immunity = 0;
    game.hazards.push({ x: 0, z: 0, radius: 1, delay: .01, windup: 1, damage });
    game.step(.02, still);
  };
  game.step(.02, still);
  expect(game.barrier).toBe(0);
  expect(game.cooldown.barrier).toBe(0);
  hit(24);
  expect(game.hp).toBe(100);
  expect(game.barrier).toBe(12);
  expect(game.barrierTime).toBe(6);
  expect(game.events).toContainEqual({ kind: 'block', x: 0, z: 0, absorbed: 24 });
  expect(game.events.some(({ kind }) => kind === 'hurt')).toBe(false);
  hit(20);
  expect(game.hp).toBe(92);
  expect(game.barrier).toBe(0);
  expect(game.barrierTime).toBe(0);
  hit(10);
  expect(game.hp).toBe(82);
  expect(game.events.filter((event) => event.kind === 'cast' && event.spell === 'barrier')).toHaveLength(1);
});

test('upgraded ice barrier expires even if it has not been depleted', () => {
  const game = new Combat([], () => .5);
  game.spells.add('barrier');
  game.perks.bulwark = 1;
  game.enemies.length = 0;
  game.hazards.push({ x: 0, z: 0, radius: 1, delay: .01, windup: 1, damage: 24 });
  game.step(.02, still);
  expect(game.barrier).toBe(24);
  game.player.immunity = 20;
  advance(game, 6.04);
  expect(game.barrier).toBe(0);
  expect(game.cooldown.barrier).toBeGreaterThan(0);
});

test('Frozen Orb travels through enemies, repeatedly damaging and slowing nearby targets', () => {
  const game = new Combat([], () => .5);
  game.player.heading = 0;
  game.spells.add('orb');
  game.cooldown.bolt = 60;
  game.enemies.length = 3;
  [[0, 4], [1.2, 4.5], [5.5, 4.5]].forEach(([x, z], i) => {
    Object.assign(game.enemies[i], { x, z, hp: 300, speed: 0 });
  });
  const [target, neighbor, outside] = game.enemies;
  advance(game, .9);
  expect(game.orbs).toHaveLength(1);
  expect(game.orbs[0].z).toBeGreaterThan(5);
  expect(target.hp).toBeLessThanOrEqual(276);
  expect(neighbor.hp).toBeLessThan(300);
  expect(neighbor.slow).toBeGreaterThan(0);
  expect(outside.hp).toBe(300);
  advance(game, 1.6);
  expect(game.orbs).toHaveLength(0);
});

test('Icicle Fall tracks up to three targets and only deals damage after the warning', () => {
  const game = new Combat([], () => .5);
  game.player.heading = 0;
  game.spells.add('comet');
  game.perks.hail = 1;
  game.cooldown.bolt = 60;
  [[0, 3], [-4, 3], [5, 3], [8, 8]].forEach(([x, z], i) => {
    Object.assign(game.enemies[i], { x, z, hp: 200, speed: 0 });
  });
  const targets = [...game.enemies];
  advance(game, .28);
  expect(game.comets).toHaveLength(3);
  expect(targets.map(({ hp }) => hp)).toEqual([200, 200, 200, 200]);
  targets[0].z += 2.5;
  advance(game, .35);
  expect(game.comets).toHaveLength(0);
  expect(targets.map(({ hp }) => hp)).toEqual([156, 156, 156, 200]);
  expect(game.events.filter(({ kind }) => kind === 'comet-impact')).toHaveLength(3);
});

test('Nova and Lance automatically chain without manual input', () => {
  const game = new Combat([], () => .5);
  game.player.heading = 0;
  game.spells.add('nova').add('lance');
  game.enemies.length = 1;
  const enemy = game.enemies[0];
  Object.assign(enemy, { x: 0, z: 3, hp: 200, speed: 0 });
  game.cooldown.bolt = 4;
  advance(game, .7);
  expect(enemy.hp).toBe(116);
  expect(enemy.frozen).toBeGreaterThan(1);
  expect(game.events).toContainEqual(expect.objectContaining({ kind: 'cast', spell: 'nova' }));
  expect(game.events).toContainEqual(expect.objectContaining({ kind: 'cast', spell: 'lance' }));
  expect(game.events).toContainEqual(expect.objectContaining({ kind: 'strike', damage: 66, frozen: true }));
});

test('automatic Lance prefers a frozen target over a closer unfrozen target', () => {
  const game = new Combat([], () => .5);
  game.player.heading = 0;
  game.spells.add('lance');
  game.cooldown.bolt = 4;
  game.enemies.length = 2;
  Object.assign(game.enemies[0], { x: 0, z: 3, hp: 200, speed: 0 });
  Object.assign(game.enemies[1], { x: 2, z: 6, hp: 200, speed: 0, frozen: 2 });
  game.step(.02, still);
  const shot = game.shots.find((candidate) => candidate.kind === 'lance')!;
  expect(shot).toBeDefined();
  expect(Math.atan2(shot.vx, shot.vz)).toBeCloseTo(Math.atan2(2, 6));
});

test('automatic Blizzard selects the largest nearby cluster instead of the nearest enemy', () => {
  const game = new Combat([], () => .5);
  game.player.heading = Math.PI / 2;
  game.spells.add('blizzard');
  game.cooldown.bolt = 4;
  [[2, -2], [8, 0], [8, 1], [9, 1]].forEach(([x, z], i) => {
    Object.assign(game.enemies[i], { x, z, hp: 200, speed: 0 });
  });
  game.step(.02, still);
  expect(game.storms).toHaveLength(1);
  expect(game.storms[0].x).toBeGreaterThanOrEqual(8);
  expect(game.cooldown.blizzard).toBeGreaterThan(0);
});

test('automatic Blink waits for danger and finds a safer valid landing near the field edge', () => {
  const obstacle = { x: FIELD_X - 1, z: 5.3, radius: 1.8 };
  const game = new Combat([obstacle], () => .5);
  game.spells.add('blink');
  game.cooldown.bolt = 4;
  game.enemies.length = 1;
  const enemy = game.enemies[0];
  Object.assign(enemy, { x: 10, z: 0, hp: 200, speed: 0 });
  game.step(.1, still);
  expect(game.player.x).toBe(0);
  expect(game.player.z).toBe(0);
  expect(game.cooldown.blink).toBe(0);
  Object.assign(game.player, { x: FIELD_X - .5, z: 0 });
  Object.assign(enemy, { x: FIELD_X - 2, z: 0 });
  game.step(.02, { x: 1, z: 0 });
  expect(Math.hypot(game.player.x - enemy.x, game.player.z - enemy.z)).toBeGreaterThan(3);
  expect(Math.hypot(game.player.x - obstacle.x, game.player.z - obstacle.z)).toBeGreaterThanOrEqual(obstacle.radius + .339);
  expect(game.player.immunity).toBeGreaterThan(0);
  expect(game.events).toContainEqual(expect.objectContaining({ kind: 'cast', spell: 'blink' }));
});

test('Nova can resolve danger without wasting automatic Blink', () => {
  const game = new Combat([], () => .5);
  game.player.heading = 0;
  game.spells.add('nova').add('blink');
  game.cooldown.bolt = 4;
  game.enemies.length = 1;
  Object.assign(game.enemies[0], { x: 0, z: 1.5, hp: 200, speed: 0 });
  game.step(.02, still);
  expect(game.enemies[0].frozen).toBeGreaterThan(0);
  expect(game.cooldown.nova).toBeGreaterThan(0);
  expect(game.cooldown.blink).toBe(0);
  expect(game.player.z).toBe(0);
});

test('haste reduces both starting automatic spells by four percent per rank', () => {
  for (const [mage, spell] of [['frost', 'bolt'], ['fire', 'fireball']] as const) {
    for (const rank of [1, 3]) {
      const game = new Combat([], () => .5, undefined, mage);
      game.perks.haste = rank;
      game.step(.02, still);
      expect(game.limits[spell]).toBeCloseTo(COOLDOWNS[spell] * .96 ** rank);
    }
  }
});

test('the fifth wave of each stage heals and summons its own boss once', () => {
  const game = new Combat([], () => .5);
  for (const [index, stage] of STAGES.entries()) {
    if (index) {
      game.time = index * STAGE_TIME - .015;
      game.step(.02, still);
    }
    game.enemies.length = 0;
    game.hp = 50;
    game.time = index * STAGE_TIME + WAVE_TIME * (WAVE_COUNT - 1) - .015;
    game.step(.02, still);
    expect(game.stage.id).toBe(stage.id);
    expect(game.wave).toBe(WAVE_COUNT);
    expect(game.hp).toBe(64);
    game.step(.02, still);
    expect(game.enemies.filter((enemy) => enemy.kind === stage.boss.kind)).toHaveLength(1);
  }
});

test('running out of health still ends the journey immediately', () => {
  const lost = new Combat([], () => .5);
  Object.assign(lost.enemies[0], { x: 0, z: .3 });
  lost.hp = 7;
  lost.step(.02, still);
  expect(lost.hp).toBe(0);
  expect(lost.status).toBe('lost');
});

test('3:00 and 6:00 change the stage while keeping both sides in place, along with every drop and spell', () => {
  const game = new Combat([], () => .31);
  Object.assign(game.player, { x: 27, z: 18 });
  game.enemies.forEach((enemy) => { enemy.speed = 0; });
  game.level = 8;
  game.xp = 7;
  game.kills = 50;
  game.fingers = 1;
  game.spells.add('lance');
  game.perks.shards = 2;
  game.maxHp = 140;
  game.cooldown.bolt = game.cooldown.lance = 60;
  game.barrier = 20;
  game.barrierTime = 6;
  for (const [index, kind] of ['shard', 'wisp'].entries()) {
    const oldEnemies = [...game.enemies];
    const locations = oldEnemies.map(({ x, z }) => [x, z]);
    game.hp = 27;
    game.wave = WAVE_COUNT;
    game.time = (index + 1) * STAGE_TIME - .01;
    const shot = { x: 1, z: 2, vx: 1, vz: 0, life: 1, kind: 'bolt' as const, charged: false, hits: new Set<number>() };
    const gem = { x: 1, z: 2, age: 1, value: 4, phase: 0, tier: 'normal' as const };
    const storm = { x: 1, z: 2, radius: 1, life: 1, maxLife: 1, tick: .5 };
    const warning = { x: 1, z: 2, radius: 2, delay: .2, windup: 1, damage: 100 };
    game.shots.push(shot);
    game.pickups.push(gem);
    game.storms.push(storm);
    game.hazards.push(warning);
    game.step(.01, still);
    expect(game.time).toBeCloseTo((index + 1) * STAGE_TIME, 6);
    expect(game.stageIndex).toBe(index + 1);
    expect(game.stageTime).toBeCloseTo(0, 6);
    expect(game.status).toBe('playing');
    expect(game.wave).toBe(1);
    expect(game.hp).toBe(140);
    expect(game.player).toMatchObject({ x: 27, z: 18 });
    expect(game.barrier).toBe(20);
    expect(game.level).toBe(8);
    expect(game.xp).toBe(7);
    expect(game.kills).toBe(50);
    expect(game.fingers).toBe(1);
    expect([...game.spells]).toEqual(['bolt', 'lance']);
    expect(game.perks.shards).toBe(2);
    oldEnemies.forEach((enemy, i) => {
      expect(game.enemies).toContain(enemy);
      expect(Math.hypot(enemy.x - locations[i][0], enemy.z - locations[i][1])).toBeLessThan(.12);
    });
    expect(game.shots).toContain(shot);
    expect(game.pickups).toContain(gem);
    expect(game.storms).toContain(storm);
    expect(game.hazards).toContain(warning);
    expect(game.events).toContainEqual({ kind: 'stage', index: index + 1 });
    advance(game, 1.5);
    expect(game.enemies.some((enemy) => enemy.kind === kind)).toBe(true);
  }
  game.time = RUN_TIME - .01;
  game.step(.02, still);
  expect(game.status).toBe('won');
  expect(game.time).toBe(RUN_TIME);
});

test('all four edges join without moving the player farther than their actual walking step', () => {
  for (const [x, z] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const game = new Combat([], () => .5);
    const startX = x * (FIELD_X - .15), startZ = z * (FIELD_Z - .15);
    Object.assign(game.player, { x: startX, z: startZ, immunity: 60 });
    for (let i = 0; i < 5; i++) {
      const before = { x: game.player.x, z: game.player.z };
      game.step(.02, { x, z });
      expect(game.player.x - before.x).toBeCloseTo(x * game.moveSpeed * .02);
      expect(game.player.z - before.z).toBeCloseTo(z * game.moveSpeed * .02);
    }
    if (x) expect(wrapAxis(game.player.x, FIELD_X)).toBeCloseTo(game.player.x - x * FIELD_X * 2);
    if (z) expect(wrapAxis(game.player.z, FIELD_Z)).toBeCloseTo(game.player.z - z * FIELD_Z * 2);
  }
});

test('monsters, pickups and obstacles on the opposite side are present before crossing a seam', () => {
  const game = new Combat([{ x: -FIELD_X + .3, z: 0, radius: .6 }], () => .5);
  const [enemy] = game.enemies;
  game.enemies = [enemy];
  Object.assign(enemy, { x: -FIELD_X + 3, z: 2, speed: 0, hp: 200 });
  Object.assign(game.player, { x: FIELD_X - .9, z: 0, heading: Math.PI / 2 });
  const gem = { x: -FIELD_X + 1, z: 0, age: 1, value: 3, phase: 0, tier: 'normal' as const };
  game.pickups.push(gem);
  game.step(.1, { x: 1, z: 0 });
  expect(game.player.x).toBeCloseTo(FIELD_X + .3 - .94);
  expect(enemy.x).toBeCloseTo(FIELD_X + 3);
  expect(gem.x).toBeGreaterThan(FIELD_X - .75);
  advance(game, .3);
  expect(game.spellDamage.get('bolt')).toBeGreaterThan(0);
});

test('automatic targeting fires sideways without turning the character or the camera heading', () => {
  const game = new Combat([], () => .5);
  game.enemies.length = 1;
  Object.assign(game.enemies[0], { x: 5, z: 0, speed: 0 });
  game.step(.02, still);
  expect(game.shots[0].vx).toBeGreaterThan(0);
  expect(game.player.angle).toBe(Math.PI);
  expect(game.player.heading).toBe(Math.PI);
  game.step(.02, { x: 1, z: 0 });
  expect(game.player.x).toBeGreaterThan(0);
  expect(game.player.angle).toBe(Math.PI);
});

test('both starters ignore rear targets, then release at exactly 90 degrees without turning', () => {
  for (const id of ['frost', 'fire'] as const) {
    const game = new Combat([], () => .5, undefined, id);
    const spell = id === 'frost' ? 'bolt' : 'fireball';
    game.player.heading = Math.PI / 2;
    const [rear, edge] = game.enemies;
    Object.assign(rear, { x: -2, z: 0, speed: 0, hp: 200 });
    Object.assign(edge, { x: 0, z: -5, speed: 0, hp: 200 });
    game.enemies = [rear];
    game.step(.02, still);
    expect(game.shots).toHaveLength(0);
    expect(game.cooldown[spell]).toBe(0);

    game.enemies.push(edge);
    game.step(.02, still);
    const shot = game.shots[0];
    expect(shot.target).toBe(edge);
    expect(shot.age).toBeLessThan(0);
    const start = { x: shot.x, z: shot.z };
    advance(game, .04);
    expect(shot.x).toBe(start.x);
    expect(shot.z).toBe(start.z);
    advance(game, .11);
    expect(shot.age).toBeGreaterThan(0);
    expect(shot.z).toBeLessThan(start.z);
    expect(game.player.heading).toBe(Math.PI / 2);
  }
});

test('a homing projectile does not loop backward if its target passes behind the cast plane', () => {
  const game = new Combat([], () => .5);
  game.player.heading = 0;
  const target = game.enemies[0];
  game.enemies = [target];
  Object.assign(target, { x: 0, z: 6, speed: 0, hp: 200 });
  advance(game, .14);
  const shot = game.shots[0];
  expect(shot.age).toBeGreaterThan(0);
  target.z = -2;
  advance(game, .08);
  expect(shot.target).toBeUndefined();
  expect(shot.vz).toBeGreaterThan(0);
  expect(target.hp).toBe(200);
});

test('a surviving old boss still casts after the atmosphere changes', () => {
  const game = new Combat([], () => .5);
  game.time = STAGE_TIME * 2 - WAVE_TIME - .01;
  game.step(.02, still);
  const prism = game.enemies.find((enemy) => enemy.kind === 'prism')!;
  expect(prism).toBeDefined();
  Object.assign(prism, { x: 0, z: -5, speed: 0, attackAt: STAGE_TIME * 2 + .03 });
  game.enemies = [prism];
  game.cooldown.bolt = 60;
  game.shots.length = 0;
  game.time = STAGE_TIME * 2 - .01;
  game.step(.02, still);
  advance(game, .06);
  expect(game.stage.id).toBe('citadel');
  expect(game.enemies).toContain(prism);
  expect(game.hazards).toHaveLength(1);
  expect(game.hazards[0].damage).toBe(24);
});

for (const [stageIndex, count, damage] of [[1, 1, 24], [2, 3, 32], [3, 5, 38], [4, 7, 44]]) {
  test(`stage ${stageIndex + 1}'s boss telegraphs ${count} blast area(s) before damage, which can be dodged`, () => {
    function prepare() {
      const game = new Combat([], () => .5);
      game.time = stageIndex * STAGE_TIME - .01;
      game.step(.02, still);
      game.time = stageIndex * STAGE_TIME + WAVE_TIME * (WAVE_COUNT - 1) - .01;
      game.step(.02, still);
      const boss = game.enemies.find((enemy) => enemy.kind === game.stage.boss.kind)!;
      Object.assign(boss, { x: 0, z: -8, speed: 0 });
      game.enemies = [boss];
      game.player.immunity = 0;
      game.cooldown.bolt = 30;
      game.shots.length = 0;
      game.time += 2.35;
      game.step(.02, still);
      return game;
    }
    const hit = prepare();
    expect(hit.hazards).toHaveLength(count);
    expect(hit.hazards[0]).toMatchObject({ x: 0, z: 0, damage });
    const { cue, radius } = hit.stage.boss.attack!;
    expect(hit.hazards.every((hazard) => hazard.cue === cue && hazard.radius === radius)).toBe(true);
    const expectedBlasts = hit.hazards.map(({ x, z }) => ({ kind: 'enemy-blast', x, z, radius, cue }));
    expect(new Set(hit.hazards.map(({ x, z }) => `${x},${z}`)).size).toBe(count);
    const windup = hit.hazards[0].windup;
    advance(hit, windup - .05);
    expect(hit.hp).toBe(100);
    advance(hit, .1);
    expect(hit.hp).toBe(100 - damage);
    expect(hit.hazards).toHaveLength(0);
    const blasts = hit.events.filter((event) => event.kind === 'enemy-blast');
    expect(blasts).toHaveLength(count);
    expect(blasts).toEqual(expect.arrayContaining(expectedBlasts));

    const dodged = prepare();
    for (let i = 0; i < Math.ceil((windup + .08) / .02); i++) dodged.step(.02, { x: 0, z: 1 });
    expect(dodged.hazards).toHaveLength(0);
    expect(dodged.hp).toBe(100);
  });
}

for (const id of ['frost', 'fire'] as const) {
  test(`${id} can finish all ${STAGES.length} stages using expedition rewards without permanent upgrades`, () => {
    test.slow();
    let seed = 401;
    const game = new Combat([], () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    }, undefined, id);
    const stages = new Set<number>([0]);
    let movement = still;
    for (let i = 0; i < RUN_TIME * 31 && (game.status === 'playing' || game.status === 'upgrade'); i++) {
      while (game.status === 'upgrade') game.choose(buildChoice(game, 'balanced', SPELL_RARITY).id);
      if (i % 5 === 0) {
        useExpedition(game);
        movement = steering(game, FIELD_X, FIELD_Z, expeditionTarget(game), game.quest?.npc);
      }
      turnTowardThreat(game, 1 / 30);
      game.step(1 / 30, movement);
      stages.add(game.stageIndex);
      game.events.length = 0;
    }
    expect(game.status, `lasted ${game.time.toFixed(1)}s and reached level ${game.level}`).toBe('won');
    expect([...stages]).toEqual(STAGES.map((_, index) => index));
    expect(game.wave).toBe(WAVE_COUNT);
    expect(game.kills).toBeGreaterThan(100);
    expect(game.level).toBeGreaterThan(1);
    expect(game.spells.size).toBeGreaterThan(1);
  });
}

test('both element-wide perks add three percent per rank while individual spell ranks still add damage', () => {
  const cold = new Combat([], () => .5);
  cold.player.heading = 0;
  cold.spells.add('nova');
  cold.perks.shards = 5;
  cold.perks['nova-power'] = 2;
  cold.enemies.length = 1;
  Object.assign(cold.enemies[0], { x: 0, z: 3, speed: 0, hp: 150 });
  advance(cold, .24);
  expect(cold.spellDamage.get('bolt')).toBe(24);
  expect(cold.spellDamage.get('nova')).toBe(27);

  const fire = new Combat([], () => .5, undefined, 'fire');
  fire.player.heading = 0;
  fire.perks.kindling = 5;
  fire.perks['fireball-power'] = 1;
  fire.enemies.length = 3;
  [0, -1.75, 2.05].forEach((x, i) => Object.assign(fire.enemies[i], { x, z: 3, speed: 0, hp: 150 }));
  advance(fire, .26);
  expect(fire.enemies.map(({ hp }) => hp)).toEqual([119, 137, 150]);
});

test('normal, elite and boss kills drop different XP tiers, with a much bigger boss reward', () => {
  const game = new Combat([], () => .5);
  game.player.heading = 0;
  const common = game.enemies[0];
  [[common, 'puff', -1.4], [game.enemies[1], 'shard', 0], [game.enemies[2], 'eclipse', 1.4]].forEach(([enemy, kind, x]) => {
    Object.assign(enemy as object, { kind, x, z: 2, hp: 1, speed: 0 });
  });
  game.enemies.length = 3;
  game.spells.add('nova');
  game.step(.02, still);
  expect(game.pickups.map(({ tier, value }) => [tier, value])).toEqual([['normal', 3], ['elite', 8], ['boss', 330]]);
  expect(PICKUP_STYLES.boss.size).toBeGreaterThan(PICKUP_STYLES.elite.size);
  expect(new Set(Object.values(PICKUP_STYLES).map(({ core }) => core)).size).toBe(3);
});

test('opening mobs and bosses wait for an offscreen location instead of popping into view', () => {
  let canSeeEverything = true;
  const game = new Combat([], () => .5, (_x, z) => canSeeEverything || z < 4);
  game.time = WAVE_TIME * (WAVE_COUNT - 1) - .01;
  game.step(.02, still);
  expect(game.enemies).toHaveLength(0);
  expect(game.events.some((event) => event.kind === 'boss')).toBe(false);

  canSeeEverything = false;
  advance(game, .33);
  expect(game.enemies.filter((enemy) => enemy.kind === 'warden')).toHaveLength(1);
  expect(game.enemies.filter((enemy) => enemy.kind === 'puff').length).toBeGreaterThanOrEqual(4);
  expect(game.enemies.every((enemy) => enemy.z > 4)).toBe(true);
  expect(game.events).toContainEqual({ kind: 'boss', boss: 'warden' });
});

test('fire starts with Fireball and offers only its own spells', () => {
  const fire = new Combat([], () => .5, undefined, 'fire');
  fire.player.heading = 0;
  expect([...fire.spells]).toEqual(['fireball']);
  const enemy = fire.enemies[0];
  fire.enemies = [enemy];
  Object.assign(enemy, { x: 0, z: 3, hp: 200, speed: 0 });
  advance(fire, .25);
  expect(enemy.hp).toBe(177);
  fire.level = SPELL_LEARN_INTERVAL - 1;
  levelUp(fire);
  expect(fire.choices.map((option) => option.id)).not.toContain('learn-nova');
  expect(fire.choices.every((option) => 'spell' in option)).toBe(true);
  expect(fire.choices.some((option) => option.id === 'learn-fire-blast' || option.id === 'learn-pyro' || option.id === 'learn-living-bomb')).toBe(true);
});

test('Fire Blast completes Hot Streak and automatically triggers a splashing Pyroblast', () => {
  const fire = new Combat([], () => .1, undefined, 'fire');
  fire.player.heading = 0;
  const [enemy, neighbor] = fire.enemies;
  fire.enemies = [enemy, neighbor];
  Object.assign(enemy, { x: 0, z: 3, hp: 300, speed: 0 });
  Object.assign(neighbor, { x: 1.4, z: 3.2, hp: 300, speed: 0 });
  fire.spells.add('fireBlast').add('pyro');
  fire.cooldown.fireball = 60;
  fire.heat = 1;
  fire.step(.02, still);
  expect(enemy.hp).toBe(260);
  expect(fire.heat).toBe(2);
  advance(fire, .62);
  expect(fire.heat).toBe(0);
  expect(enemy.hp).toBe(154);
  expect(neighbor.hp).toBe(227);
  expect(fire.events).toContainEqual(expect.objectContaining({ kind: 'cast', spell: 'pyro' }));
});

test('a fresh Hot Streak allows another automatic Pyroblast without waiting for a cooldown', () => {
  const fire = new Combat([], () => .5, undefined, 'fire');
  fire.player.heading = 0;
  fire.enemies.length = 1;
  Object.assign(fire.enemies[0], { x: 0, z: 4, hp: 1000, speed: 0 });
  fire.spells.add('pyro');
  fire.cooldown.fireball = 60;
  fire.heat = 1;
  fire.step(.02, still);
  expect(fire.cast('pyro', null, still)).toBe(false);
  fire.heat = 2;
  fire.step(.02, still);
  expect(fire.heat).toBe(0);
  expect(fire.cooldown.pyro).toBe(0);
  fire.heat = 2;
  advance(fire, .48);
  expect(fire.events.filter((event) => event.kind === 'cast' && event.spell === 'pyro')).toHaveLength(2);
  expect(fire.heat).toBe(0);
  expect(fire.time).toBeLessThan(1);
});
