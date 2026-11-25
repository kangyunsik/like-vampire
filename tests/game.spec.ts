import { expect, test, type Page } from '@playwright/test';
import type { BufferGeometry, Mesh, MeshBasicMaterial } from 'three';
import type { Combat } from '../src/combat';
import { FIELD_X, FIELD_Z, FIRE_SPELLS, RUN_TIME, SPELLS, STAGES, STAGE_TIME, WAVE_COUNT, WAVE_TIME, clock } from '../src/data';
import type { World } from '../src/world/scene';

const totalSpells = SPELLS.length;

test.beforeEach(async ({ page }) => {
  // Existing combat and render fixtures start as Frost unless a test picks Fire.
  await page.addInitScript(() => {
    if (!localStorage.getItem('frostfall.class')) localStorage.setItem('frostfall.class', 'frost');
  });
});

async function beginRun(page: Page, byKeyboard = false) {
  const probe = await page.evaluateHandle(async () => {
    const { Combat } = await import(`${location.origin}/src/combat.ts`);
    const original = Combat.prototype.step;
    const ready = new Promise<Combat>((resolve) => {
      Combat.prototype.step = function (this: Combat, dt: number, input: { x: number; z: number }) {
        Combat.prototype.step = original;
        const result = original.call(this, dt, input);
        resolve(this);
        return result;
      };
    });
    return { ready };
  });
  if (byKeyboard) {
    await expect(page.locator('#start')).toBeEnabled();
    await page.keyboard.press('Enter');
  }
  else await page.getByRole('button', { name: /모험 시작/ }).click();
  const game = await probe.evaluateHandle(({ ready }) => ready);
  await probe.dispose();
  return game;
}

test('the spellbook, guide and persistent audio settings work', async ({ page }) => {
  await page.goto('/');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await expect(page.locator('#arena')).toHaveAttribute('data-state', 'menu');
  await expect(page.locator('#viewport canvas')).toBeVisible();
  const dialog = page.getByRole('dialog');
  await page.getByRole('button', { name: '조작 방법', exact: true }).click();
  await expect(dialog).toHaveAccessibleName('조작 방법');
  await expect(dialog).toContainText('얼음 화살 하나로 시작해요');
  await expect(dialog).toContainText('모든 주문은 자동 시전돼요');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await page.locator('[data-spell="bolt"]').click();
  await expect(dialog).toHaveAccessibleName('마법 도감');
  await expect(dialog.locator('.highlighted')).toContainText('Frostbolt');
  await expect(dialog.locator('[data-entry="lance"]')).toContainText('레벨업 습득');
  await expect(dialog.locator('[data-entry="frostChain"] .rarity-badge')).toHaveText('레어');
  await expect(dialog.locator('[data-entry="absoluteZero"] .rarity-badge')).toHaveText('유니크');
  await dialog.getByRole('button', { name: '닫기' }).click();

  const audio = page.getByRole('button', { name: '효과음' });
  await expect(audio).toHaveAttribute('aria-pressed', 'true');
  await audio.click();
  await page.getByRole('button', { name: '설정' }).click();
  await expect(dialog.getByRole('checkbox', { name: /효과음/ })).not.toBeChecked();
  await dialog.getByText('피해 수치', { exact: true }).click();
  await expect(dialog.getByRole('checkbox', { name: /피해 수치/ })).not.toBeChecked();
  await page.reload();
  await expect(audio).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: '설정' }).click();
  await expect(dialog.getByRole('checkbox', { name: /피해 수치/ })).not.toBeChecked();
  expect(errors).toEqual([]);
});

test('the experience bar is readable across the arena during a run', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 800 });
  await page.goto('/');
  const experience = page.locator('#xp-bar');
  await expect(experience).toBeHidden();
  await expect(experience).toHaveAttribute('aria-valuemax', '9');
  await expect(page.locator('#xp-text')).toHaveText('0 / 9 · 0%');
  await expect(page.locator('#xp-next-level')).toHaveText('LV 02');
  await page.getByRole('button', { name: /모험 시작/ }).click();
  await expect(experience).toBeVisible();
  const barBounds = await experience.boundingBox();
  const arenaBounds = await page.locator('#arena').boundingBox();
  expect(barBounds!.height).toBeGreaterThanOrEqual(12);
  expect(barBounds!.width).toBeGreaterThan(arenaBounds!.width * .85);
});

test('expedition map markers, NPC interaction and quest gold work in the game', async ({ page }) => {
  await page.goto('/');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const game = await beginRun(page);
  await game.evaluate((run) => {
    run.player.immunity = 200;
    run.supplies.push({ x: 100, z: 80, kind: 'heart', expires: 50 });
  });
  await page.keyboard.press('m');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toHaveAccessibleName('전장 지도');
  await expect(dialog).toContainText('960 × 720');
  await expect(dialog.locator('[data-map-marker="npc"]')).toHaveCount(13);
  await expect(dialog.locator('[data-map-marker="heart"]')).toHaveCount(1);
  await page.keyboard.press('m');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('group', { name: '나침반' })).toHaveText(/북 · 000°/);
  await game.evaluate((run) => { run.player.heading = Math.PI / 2; });
  await expect(page.locator('#compass-heading')).toHaveText('동 · 090°');

  await game.evaluate((run) => {
    const npc = run.questNpcs.find(({ quest }) => quest === 'salvage')!;
    Object.assign(run.player, { x: npc.x, z: npc.z });
    run.level = 50;
  });
  await expect(page.getByRole('button', { name: '대화 F' })).toBeVisible();
  await page.keyboard.press('f');
  await expect(dialog).toHaveAccessibleName('흩어진 수정');
  await expect(dialog).toContainText('무작위 3분 버프');
  await dialog.getByRole('button', { name: '의뢰 수락' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('#quest-detail')).toHaveText('0 / 35개 · 2 G');
  await game.evaluate((run) => {
    run.supplies.push({ x: run.player.x, z: run.player.z, kind: 'magnet', expires: run.time + 20 });
    for (let i = 0; i < 35; i++) run.pickups.push({ x: -240, z: -200, value: 3, age: 1, phase: 0, tier: 'normal' });
  });
  await expect(page.locator('#quest-gold')).toHaveText('2 G');
  await expect(page.locator('#quest-buffs')).toHaveText(/공격력 \+10%|이동 속도 \+10%|최대 체력 ×2/);
  await expect(dialog).toHaveAccessibleName('퀘스트 완료');
  await expect(dialog.locator('.quest-reward-grid')).toContainText('경험치+85');
  await expect(dialog.locator('.quest-reward-grid')).toContainText('골드+2 G');
  await expect(dialog.locator('.quest-reward-grid')).toContainText('3분 버프');
  await dialog.getByRole('button', { name: '계속하기' }).click();
  await page.keyboard.press('g');
  await expect(dialog).toHaveAccessibleName('공용 특성');
  await expect(dialog.locator('#quest-gold-balance')).toHaveText('2 G');
  await expect(dialog.locator('[data-common-talent="bolt-power"]')).toHaveCount(0);
  await dialog.getByRole('button', { name: '빠른 재생 강화' }).click();
  await expect(dialog.locator('#quest-gold-balance')).toHaveText('0 G');
  await expect(dialog.getByRole('button', { name: '빠른 재생 강화' })).toBeDisabled();
  expect(await game.evaluate((run) => run.recoveryInterval)).toBe(9);
  await page.keyboard.press('Escape');
  await game.evaluate((run) => {
    const npc = run.questNpcs.find(({ quest }) => quest === 'signals')!;
    Object.assign(run.player, { x: npc.x, z: npc.z });
  });
  await page.keyboard.press('f');
  await expect(dialog).toHaveAccessibleName('잃어버린 신호');
  await dialog.getByRole('button', { name: '의뢰 수락' }).click();
  await page.keyboard.press('m');
  await expect(dialog.locator('[data-map-marker="signal"]')).toHaveCount(3);
  expect(errors).toEqual([]);
  await game.dispose();
});

test('a ranged elite renders its warning and plays distinct warning and impact sounds', async ({ page }) => {
  await page.goto('/');
  const observed = await page.evaluateHandle(() => {
    const pitches: number[] = [], labels: string[] = [];
    const make = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () {
      const node = make.call(this), set = node.frequency.setValueAtTime.bind(node.frequency);
      node.frequency.setValueAtTime = (frequency, time) => {
        pitches.push(frequency);
        return set(frequency, time);
      };
      return node;
    };
    const context = document.querySelector<HTMLCanvasElement>('#damage-canvas')!.getContext('2d')!;
    const text = context.fillText.bind(context);
    context.fillText = (value, x, y, width) => {
      if (value.startsWith('번개 낙점') && !labels.length) labels.push(value);
      if (width === undefined) text(value, x, y);
      else text(value, x, y, width);
    };
    return { pitches, labels };
  });
  const game = await beginRun(page);
  await game.evaluate((run, start) => {
    run.time = start - .01;
    run.player.immunity = 100;
    run.cooldown.bolt = 100;
    run.shots.length = 0;
  }, STAGES.findIndex(({ id }) => id === 'tempest') * STAGE_TIME);
  await expect(page.locator('#arena')).toHaveAttribute('data-stage', 'tempest');
  await game.evaluate((run) => {
    const elite = run.enemies[0];
    Object.assign(run.player, { x: 0, z: 0, heading: Math.PI });
    Object.assign(elite, { kind: 'stormAdept', x: 0, z: -8.5, attackAt: run.time + .06, hp: 600, maxHp: 600, speed: 0 });
    run.enemies = [elite];
    run.hazards.length = 0;
  });
  await expect.poll(() => observed.evaluate(({ labels }) => labels[0])).toMatch(/번개 낙점 · [0-9.]+초/);
  await expect.poll(() => observed.evaluate(({ pitches }) => pitches.includes(1278))).toBe(true);
  await expect.poll(() => observed.evaluate(({ pitches }) => pitches.indexOf(209) > pitches.indexOf(1278))).toBe(true);
  await game.dispose();
  await observed.dispose();
});

test('left drag looks around, right drag steers, and the WoW-style camera follows movement', async ({ page }) => {
  await page.goto('/');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const tactical = page.getByRole('button', { name: '전술 시점' });
  await expect(tactical).toBeDisabled();
  const view = await page.evaluateHandle(async () => {
    const { World } = await import(`${location.origin}/src/world/scene.ts`);
    const draw = World.prototype.draw;
    return new Promise<World>((resolve) => {
      World.prototype.draw = function (this: World, ...args: Parameters<World['draw']>) {
        World.prototype.draw = draw;
        draw.apply(this, args);
        resolve(this);
      };
    });
  });
  const game = await beginRun(page);
  await game.evaluate((run) => {
    run.enemies.length = 0;
    run.cooldown.bolt = 60;
    run.shots.length = 0;
    run.player.immunity = 30;
  });
  await expect(tactical).toBeEnabled();
  await page.screenshot({ path: test.info().outputPath('third-person.png') });
  const area = (await page.locator('#viewport').boundingBox())!;
  const from = { x: area.x + area.width * .41, y: area.y + area.height * .52 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(from.x + 370, from.y, { steps: 5 });
  await page.mouse.up({ button: 'left' });
  const freeHeading = await view.evaluate((world) => world.cameraHeading);
  expect(Math.abs(freeHeading)).toBeLessThan(.3);
  expect(await game.evaluate((run) => run.player.heading)).toBe(Math.PI);
  await page.screenshot({ path: test.info().outputPath('free-orbit-front.png') });
  expect(await view.evaluate((world) => world.cameraHeading)).toBeCloseTo(freeHeading, 4);

  await page.keyboard.down('w');
  try {
    await expect.poll(() => game.evaluate((run) => run.player.z)).toBeLessThan(-.35);
  } finally {
    await page.keyboard.up('w');
  }
  await expect.poll(() => view.evaluate((world) => Math.abs(world.cameraHeading))).toBeGreaterThan(3.05);

  await page.mouse.move(from.x, from.y);
  await page.mouse.down({ button: 'right' });
  await expect(page.locator('#viewport')).toHaveClass(/dragging/);
  const beforeSteer = await game.evaluate((run) => run.player.heading);
  await page.mouse.move(from.x + 190, from.y + 15, { steps: 6 });
  await page.mouse.up({ button: 'right' });
  await expect(page.locator('#viewport')).not.toHaveClass(/dragging/);
  const heading = await game.evaluate((run) => run.player.heading);
  const delta = heading - beforeSteer;
  expect(Math.atan2(Math.sin(delta), Math.cos(delta))).toBeCloseTo(-190 * .008, 1);
  await page.keyboard.down('w');
  try {
    await expect.poll(() => game.evaluate((run) => run.player.x)).toBeGreaterThan(1);
  } finally {
    await page.keyboard.up('w');
  }
  await page.keyboard.press('v');
  await expect(tactical).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: test.info().outputPath('tactical-camera.png') });
  await page.keyboard.press('v');
  await expect(tactical).toHaveAttribute('aria-pressed', 'false');
  expect(await game.evaluate((run) => run.player.heading)).toBeCloseTo(heading, 5);
  expect(errors).toEqual([]);
  await game.dispose();
  await view.dispose();
});

test('holding right click and moving into level-up never opens the browser context menu', async ({ page }) => {
  await page.goto('/');
  const game = await beginRun(page);
  const viewport = page.locator('#viewport');
  const area = (await viewport.boundingBox())!;
  const dialog = page.getByRole('dialog');
  await page.mouse.move(area.x + area.width * .46, area.y + area.height * .50);
  await page.mouse.down({ button: 'right' });
  await page.keyboard.down('w');
  try {
    await expect(viewport).toHaveClass(/dragging/);
    await expect.poll(() => game.evaluate((run) => run.player.moving)).toBe(true);
    await game.evaluate((run) => { run.xp = run.goal; });
    await expect(dialog).toHaveAccessibleName('레벨 업!');
    await expect(viewport).not.toHaveClass(/dragging/);
    const choice = dialog.locator('.upgrade-card').first();
    await choice.hover();
    expect(await choice.evaluate((card) => {
      const event = new MouseEvent('contextmenu', { button: 2, bubbles: true, cancelable: true });
      card.dispatchEvent(event);
      return event.defaultPrevented;
    })).toBe(true);
  } finally {
    await page.mouse.up({ button: 'right' });
    await page.keyboard.up('w');
  }
  await page.keyboard.press('1');
  await expect(dialog).toBeHidden();
  await expect(page.locator('#arena')).toHaveAttribute('data-state', 'playing');
  await game.dispose();
});

test('A and D strafe relative to the character without rotating them', async ({ page }) => {
  await page.goto('/');
  const game = await beginRun(page);
  await game.evaluate((run) => {
    run.enemies.length = 0;
    run.shots.length = 0;
    run.cooldown.bolt = 60;
    Object.assign(run.player, { heading: Math.PI / 2, angle: Math.PI / 2, casting: 0, immunity: 30 });
  });

  await page.keyboard.down('a');
  try {
    await expect.poll(() => game.evaluate((run) => run.player.z)).toBeLessThan(-.5);
  } finally {
    await page.keyboard.up('a');
  }
  const left = await game.evaluate((run) => ({ ...run.player }));
  expect(left.x).toBeCloseTo(0, 3);
  expect(left.heading).toBeCloseTo(Math.PI / 2);
  expect(left.angle).toBeCloseTo(left.heading);

  await page.keyboard.down('d');
  try {
    await expect.poll(() => game.evaluate((run) => run.player.z)).toBeGreaterThan(left.z + .5);
  } finally {
    await page.keyboard.up('d');
  }
  const right = await game.evaluate((run) => ({ ...run.player }));
  expect(right.x).toBeCloseTo(0, 3);
  expect(right.heading).toBeCloseTo(left.heading);
  expect(right.angle).toBeCloseTo(right.heading);
  await game.dispose();
});

test('only learned spells occupy slots; old hotkeys cannot activate an unlearned spell', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /모험 시작/ })).toBeVisible();
  const game = await beginRun(page, true);
  await game.evaluate((run) => { Object.assign(run.enemies[0], { x: 0, z: -4, speed: 0 }); });
  await expect(page.locator('#arena')).toHaveAttribute('data-state', 'playing');
  await expect(page.locator('[data-spell="bolt"]')).toHaveClass(/cooling/);
  await expect(page.locator('#spell-count')).toHaveText(`1 / ${totalSpells}`);
  await expect(page.locator('.spell-card')).toHaveCount(1);
  await page.keyboard.press('q');
  await page.keyboard.press('e');
  await page.keyboard.press('r');
  await page.keyboard.press('Space');
  await expect(page.locator('.spell-card')).toHaveCount(1);
  await page.locator('[data-spell="bolt"]').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toHaveAccessibleName('마법 도감');
  await expect(dialog.locator('.highlighted')).toContainText('자동 시전');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveAccessibleName('일시 정지');
  const paused = await page.locator('#elapsed').textContent();
  await page.waitForTimeout(1150);
  await expect(page.locator('#elapsed')).toHaveText(paused!);
  await dialog.getByRole('button', { name: '계속하기' }).click();
  await expect(page.locator('#elapsed')).not.toHaveText(paused!);
  await page.getByRole('button', { name: '일시 정지' }).click();
  await dialog.getByRole('button', { name: '전장 나가기' }).click();
  await expect(page.getByRole('button', { name: /모험 시작/ })).toBeVisible();
  await expect(page.locator('#elapsed')).toHaveText('00:00');
  await expect(page.locator('#spell-count')).toHaveText(`1 / ${totalSpells}`);
  await game.dispose();
});

test('the larger level-up dialog offers enhancements first, then new spells every fifth level', async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 0; });
  await page.goto('/');
  const game = await beginRun(page);
  await game.evaluate((run) => {
    run.enemies.length = 1;
    Object.assign(run.enemies[0], { x: 0, z: -3, hp: 500, speed: 0 });
    run.cooldown.bolt = 60;
    run.pickups.push({ x: run.player.x, z: run.player.z, age: .2, phase: 0, value: run.goal, tier: 'normal' });
  });
  const dialog = page.getByRole('dialog');
  await expect(dialog).toHaveAccessibleName('레벨 업!');
  await expect(dialog.getByRole('heading', { name: '레벨 업!' })).toBeFocused();
  const firstChoice = dialog.locator('.upgrade-card').first();
  await expect(firstChoice).toHaveCSS('outline-style', 'none');
  await expect(dialog.locator('.new-spell')).toHaveCount(0);
  await expect(dialog.locator('.upgrade-card')).toHaveCount(3);
  await expect(dialog).toContainText('다음 새 주문은 레벨 5');
  expect((await dialog.boundingBox())?.width).toBeGreaterThan(900);
  await expect(page.locator('#xp-bar')).toHaveAttribute('aria-valuemax', '13');
  await page.keyboard.press('Tab');
  await expect(firstChoice).toBeFocused();
  await expect(firstChoice).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('1');
  await expect(dialog).toBeHidden();
  await expect(page.locator('#spell-count')).toHaveText(`1 / ${totalSpells}`);
  await game.evaluate((run) => {
    run.level = 4;
    run.pickups.push({ x: run.player.x, z: run.player.z, age: .2, phase: 0, value: run.goal, tier: 'normal' });
  });
  await expect(dialog.locator('.new-spell')).toHaveCount(3);
  await expect(dialog.locator('.new-spell[data-rarity="common"]')).toHaveCount(3);
  await page.keyboard.press('1');
  await expect(dialog).toBeHidden();
  const nova = page.locator('[data-spell="nova"]');
  await expect(nova).toBeVisible();
  await expect(nova.locator('.spell-state')).toHaveText('AUTO');
  await expect(nova).toHaveClass(/cooling/);
  await expect(page.locator('#spell-count')).toHaveText(`2 / ${totalSpells}`);
  await game.evaluate((run) => {
    run.level = 9;
    run.pickups.push({ x: run.player.x, z: run.player.z, age: .2, phase: 0, value: run.goal, tier: 'normal' });
  });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.new-spell')).toHaveCount(3);
  await expect(dialog.locator('.new-spell[data-rarity="rare"]').first()).toBeVisible();
  await expect(dialog.locator('[data-upgrade="learn-nova"]')).toHaveCount(0);
  await expect(page.locator('#xp-bar')).toHaveAttribute('aria-valuemax', '45');
  await expect(page.locator('#xp-next-level')).toHaveText('LV 11');
  await dialog.screenshot({ path: test.info().outputPath('level-up-dialog.png') });
  await dialog.locator('[data-upgrade="learn-frost-chain"]').click();
  await expect(page.locator('[data-spell="frostChain"]')).toBeVisible();
  await expect(page.locator('[data-spell="frostChain"]')).toHaveClass(/cooling/);
  await expect(page.locator('#spell-count')).toHaveText(`3 / ${totalSpells}`);
  await game.dispose();
});

test('Icicle Fall casts with audio on without freezing; spell cards follow acquisition order', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => { Math.random = () => .9999; });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '효과음' })).toHaveAttribute('aria-pressed', 'true');
  const played = await page.evaluateHandle(() => {
    const pitches: number[] = [];
    const make = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () {
      const node = make.call(this);
      const set = node.frequency.setValueAtTime.bind(node.frequency);
      node.frequency.setValueAtTime = (frequency, time) => {
        pitches.push(frequency);
        return set(frequency, time);
      };
      return node;
    };
    return pitches;
  });
  const game = await beginRun(page);
  await game.evaluate((run) => {
    run.enemies.length = 1;
    Object.assign(run.enemies[0], { x: 0, z: -4, hp: 500, maxHp: 500, speed: 0 });
    run.cooldown.bolt = 60;
    run.shots.length = 0;
    run.level = 4;
    run.pickups.push({ x: 0, z: 0, age: .35, value: run.goal, phase: 0, tier: 'normal' });
  });
  const dialog = page.getByRole('dialog');
  await expect(dialog).toHaveAccessibleName('레벨 업!');
  await dialog.locator('[data-upgrade="learn-comet"]').click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('[data-spell="comet"]')).toHaveClass(/cooling/);
  await expect.poll(() => played.evaluate((pitches) => pitches.includes(1510))).toBe(true);
  await expect.poll(() => game.evaluate((run) => run.enemies[0].hp)).toBe(463);
  await expect.poll(() => played.evaluate((pitches) => pitches.includes(2030))).toBe(true);
  await expect(page.locator('#elapsed')).not.toHaveText('00:00');

  for (const [id, before] of [['barrier', 9], ['orb', 14]] as const) {
    await game.evaluate((run, level) => {
      run.level = level;
      run.pickups.push({ x: 0, z: 0, age: .35, value: run.goal, phase: 0, tier: 'normal' });
    }, before);
    await dialog.locator(`[data-upgrade="learn-${id}"]`).click();
    await expect(dialog).toBeHidden();
  }
  const cards = page.locator('.spell-card');
  await expect(cards).toHaveCount(4);
  expect(await cards.evaluateAll((elements) => elements.map((element) => (element as HTMLElement).dataset.spell)))
    .toEqual(['bolt', 'comet', 'barrier', 'orb']);
  await page.getByRole('button', { name: '마법 도감', exact: true }).click();
  await expect(dialog).toHaveAccessibleName('마법 도감');
  await expect(dialog.locator('.entry h3')).toHaveText([/얼음 화살/, /고드름 낙하/, /얼음 보호막/, /얼어붙은 구슬/]);
  await expect(dialog.locator('[data-entry="nova"]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await game.evaluate((run) => {
    run.player.immunity = 0;
    run.hazards.push({ x: 0, z: 0, radius: 1, delay: .01, windup: 1, damage: 24 });
    run.pickups.push({ x: -4.1, z: 1, age: .65, value: 3, phase: 0, tier: 'normal' },
      { x: 4.1, z: 1.4, age: .65, value: 8, phase: 0, tier: 'elite' },
      { x: 2.5, z: -5.8, age: .65, value: 85, phase: 0, tier: 'boss' });
  });
  await expect(page.locator('#shield-value')).toHaveText('12');
  await expect(page.locator('#health-text')).toHaveText('100 / 100');
  await page.screenshot({ path: test.info().outputPath('barrier-and-xp-tiers.png') });
  expect(errors).toEqual([]);
  await game.dispose();
  await played.dispose();
});

test('live and final damage tables share effective totals, and replay resets the run', async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => .5;
    localStorage.setItem('frostfall.numbers', 'off');
  });
  await page.goto('/');
  const game = await beginRun(page);
  await page.keyboard.press('t');
  const live = page.getByRole('complementary', { name: '실시간 피해 집계' });
  await expect(live).toBeVisible();
  await expect(page.locator('#arena')).toHaveAttribute('data-state', 'playing');
  await game.evaluate((run) => {
    run.spells.add('lance').add('nova');
    run.enemies.length = 1;
    run.shots.length = 0;
    run.spellDamage.clear();
    Object.assign(run.enemies[0], { x: run.player.x, z: run.player.z - 2.5, hp: 44, speed: 0, frozen: 0 });
    for (const spell of Object.keys(run.cooldown) as (keyof Combat['cooldown'])[]) run.cooldown[spell] = 60;
    run.cooldown.nova = run.cooldown.lance = 0;
    run.cast('nova', null, { x: 0, z: 0 });
    run.cast('lance', null, { x: 0, z: 0 });
  });
  await expect.poll(() => game.evaluate((run) => run.spellDamage.get('lance'))).toBe(26);
  await expect(live.locator('#live-damage-total')).toHaveText('44');
  await expect(live.locator('tbody th')).toHaveText(['얼음창', '얼음 회오리']);
  await expect(live.locator('tbody td')).toHaveText(['26', '59.1%', '18', '40.9%']);
  await page.keyboard.press('t');
  await expect(live).toBeHidden();
  await game.evaluate((run) => {
    run.time = 18;
    run.hp = 1;
    run.player.immunity = 0;
    run.hazards.push({ x: run.player.x, z: run.player.z, radius: 1, delay: .01, windup: 1, damage: 10 });
  });
  const dialog = page.getByRole('dialog');
  await expect(dialog).toHaveAccessibleName('모험이 끝났어요');
  await expect(dialog.locator('#reward-points')).toHaveText('+0 P');
  const damage = dialog.getByRole('table', { name: '주문별 피해량' });
  await expect(damage.locator('tbody th')).toHaveText(['얼음창', '얼음 회오리']);
  await expect(damage.locator('tbody td')).toHaveText(['26', '59.1%', '18', '40.9%']);
  await expect(dialog.getByRole('button', { name: '메인으로' })).toBeVisible();
  await expect(dialog.locator('.damage-report header strong')).toHaveText('44');
  const record = await page.locator('#best-time').textContent();
  expect(record).toBe('00:18');
  await dialog.getByRole('button', { name: '다시 도전' }).click();
  await expect(page.locator('#arena')).toHaveAttribute('data-state', 'playing');
  await expect(page.locator('#level')).toHaveText('01');
  await expect(page.locator('#spell-count')).toHaveText(`1 / ${totalSpells}`);
  await expect(page.locator('.spell-card')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('#best-time')).toHaveText(record!);
  await expect(page.locator('#xp-bar')).toBeHidden();
  await expect(page.locator('#xp-bar')).toHaveAttribute('aria-valuemax', '9');
  await expect(page.locator('#xp-text')).toHaveText('0 / 9 · 0%');
  await game.dispose();
});

test('Lumi breathes, turns her head and raises her wand on the main menu', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const idle = await page.evaluateHandle(async () => {
    const { World } = await import(`${location.origin}/src/world/scene.ts`);
    const draw = World.prototype.draw;
    const result = { head: 0, wrist: 0 };
    let startHead: import('three').Quaternion | undefined, startWrist: import('three').Quaternion | undefined;
    World.prototype.draw = function (this: World, ...args: Parameters<World['draw']>) {
      draw.apply(this, args);
      if (args[0]) return;
      const { mage } = this as unknown as { mage: { root: import('three').Group } };
      const model = mage.root.getObjectByName('lumi-meshy');
      const head = model?.getObjectByName('mixamorigHead'), wrist = model?.getObjectByName('mixamorigRightHand');
      if (!head || !wrist) return;
      startHead ??= head.quaternion.clone();
      startWrist ??= wrist.quaternion.clone();
      result.head = Math.max(result.head, head.quaternion.angleTo(startHead));
      result.wrist = Math.max(result.wrist, wrist.quaternion.angleTo(startWrist));
    };
    return result;
  });
  await expect(page.locator('#arena')).toHaveAttribute('data-state', 'menu');
  await expect.poll(() => idle.evaluate(({ head, wrist }) => Math.min(head, wrist)), { timeout: 8000 }).toBeGreaterThan(.10);
  await idle.dispose();
});

test('completed stages award persistent points to spend on permanent upgrades shared by both classes', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '영구 강화', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toHaveAccessibleName('영구 강화');
  await expect(dialog.locator('#permanent-balance')).toHaveText('0 P');
  await expect(dialog.locator('[data-permanent="damage"]')).toBeDisabled();
  await expect(dialog.locator('[data-talent="health"]')).toContainText('다음 +5%');
  await expect(dialog.locator('[data-talent="recovery"]')).toContainText('다음 +15%');
  await expect(dialog.locator('[data-talent="xp"]')).toContainText('다음 +5%');
  await expect(dialog.locator('[data-talent="regeneration"]')).toContainText('다음 −0.5초');
  await expect(dialog.locator('[data-talent="status-time"]')).toContainText('다음 +0.5초');
  await page.keyboard.press('Escape');

  const game = await beginRun(page);
  await game.evaluate((run, boundary) => { run.time = boundary - .01; }, STAGE_TIME * 2);
  await expect(page.locator('#arena')).toHaveAttribute('data-stage', 'citadel');
  await game.evaluate((run) => {
    run.hp = 1;
    run.player.immunity = 0;
    run.enemies.length = 1;
    Object.assign(run.enemies[0], { x: run.player.x, z: run.player.z + .2, hp: 500, speed: 0, frozen: 0 });
    run.cooldown.bolt = 60;
    run.shots.length = 0;
  });
  await expect(dialog).toHaveAccessibleName('모험이 끝났어요');
  await expect(dialog.locator('#reward-points')).toHaveText('+20 P');
  await page.keyboard.press('Escape');
  await expect(dialog.locator('#reward-points')).toHaveText('+20 P');
  await dialog.getByRole('button', { name: '영구 강화', exact: true }).click();
  await expect(dialog).toHaveAccessibleName('영구 강화');
  await expect(dialog.locator('#permanent-balance')).toHaveText('20 P');
  await page.screenshot({ path: test.info().outputPath('permanent-upgrades.png') });

  const damage = dialog.locator('[data-talent="damage"]');
  await damage.getByRole('button').click();
  await expect(damage).toContainText('1 / 8단계');
  await expect(damage).toContainText('현재 +3%');
  await expect(damage.getByRole('button')).toHaveText(/16 P/);
  await expect(damage.getByRole('button')).toBeDisabled();
  await expect(dialog.locator('#permanent-balance')).toHaveText('10 P');
  await dialog.locator('[data-permanent="cooldown"]').click();
  await expect(dialog.locator('#permanent-balance')).toHaveText('0 P');
  await game.dispose();

  await page.reload();
  await expect(page.locator('#permanent-points')).toHaveText('0 P');
  await page.getByRole('button', { name: '영구 강화', exact: true }).click();
  await expect(damage).toContainText('현재 +3%');
  await expect(dialog.locator('[data-talent="cooldown"]')).toContainText('현재 −2%');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '화염 마법사' }).click();
  const nextRun = await beginRun(page);
  await nextRun.evaluate((run) => { Object.assign(run.enemies[0], { x: 0, z: -4, speed: 0 }); });
  await expect.poll(() => nextRun.evaluate((run) => run.limits.fireball)).toBeCloseTo(1.04 * .98);
  await nextRun.dispose();
});

test('development stage practice starts with the selected loadout without overwriting records or points', async ({ page }) => {
  const saves = { best: '{"time":12,"kills":4}', progression: '{"version":1,"points":40,"ranks":{"cooldown":3}}' };
  await page.addInitScript((stored) => {
    localStorage.setItem('frostfall.class', 'fire');
    for (const [key, value] of Object.entries(stored)) localStorage.setItem(`frostfall.${key}`, value);
  }, saves);
  await page.goto('/?stage=8&build=chain');
  await expect(page.locator('#stage-trial-status')).toContainText('냉기 특성');
  await expect(page.getByRole('button', { name: /테스트 시작/ })).toBeDisabled();
  await page.getByRole('button', { name: '냉기 마법사' }).click();
  await expect(page.locator('#stage-trial-status')).toContainText('8스테이지 · 연쇄 주문 세팅');
  await expect(page.locator('#start')).toBeEnabled();
  await page.locator('#arena').focus();
  const game = await beginRun(page, true);
  const arena = page.locator('#arena');
  await expect(arena).toHaveAttribute('data-stage', STAGES[7].id);
  await expect(page.locator('#elapsed')).toHaveText(/21:0[0-4]/);
  await expect(page.locator('#wave')).toHaveText('1');
  await expect(page.locator('#level')).toHaveText('73');
  await expect(page.locator('[data-spell="frostChain"]')).toBeVisible();
  await expect(page.locator('[data-spell="chainLightning"]')).toBeVisible();
  await expect(page.locator('.stage-route [data-state="cleared"]')).toHaveCount(0);
  expect(await game.evaluate((run) => run.perks['chain-lightning-amplify'])).toBe(2);
  expect(await game.evaluate((run) => run['permanent'].cooldown)).toBe(1);

  await game.evaluate((run, finish) => { run.time = finish - .01; }, RUN_TIME);
  const dialog = page.getByRole('dialog');
  await expect(dialog).toHaveAccessibleName('테스트를 완주했어요!');
  await expect(dialog.locator('.result-stats strong').first()).toHaveText('09:00');
  await expect(dialog.locator('.result-stats strong').last()).toHaveText('3 / 3');
  await expect(dialog.locator('#reward-points')).toHaveText('+0 P');
  await expect(dialog.locator('.record-ribbon')).toHaveCount(0);
  await expect(page.locator('#best-time')).toHaveText('00:12');
  expect(await page.evaluate((keys) => Object.fromEntries(keys.map((key) => [key, localStorage.getItem(`frostfall.${key}`)])),
    Object.keys(saves))).toEqual(saves);
  await dialog.getByRole('button', { name: '다시 도전' }).click();
  await expect(arena).toHaveAttribute('data-state', 'playing');
  await expect(arena).toHaveAttribute('data-stage', STAGES[7].id);
  await game.dispose();
});

test('all ten stage atmospheres continue in one world, with victory at 30 minutes', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#arena')).toHaveAttribute('data-stage', 'grove');
  await expect(page.locator('.run-limit')).toHaveText(`/ ${clock(RUN_TIME)}`);
  const game = await beginRun(page);
  await game.evaluate((run, boundary) => {
    run.time = boundary - .01;
    run.hp = 20;
    run.maxHp = 140;
    run.level = 8;
    run.xp = 7;
    run.spells.add('lance');
    run.cooldown.bolt = run.cooldown.lance = 100;
    run.shots.length = 0;
    Object.assign(run.player, { x: 25, z: 2 });
    Object.assign(run.enemies[0], { x: 21.5, z: -1, speed: 0, frozen: 100, hp: 123, maxHp: 123 });
    run.pickups.push({ x: 23, z: 6, age: 1, value: 8, phase: 0, tier: 'elite' });
  }, STAGE_TIME);
  await expect(page.locator('#arena')).toHaveAttribute('data-stage', 'cavern');
  await expect(page.locator('#map-title')).toHaveText('오로라 수정동굴');
  await expect(page.locator('#stage-number')).toHaveText(`2 / ${STAGES.length}`);
  await expect(page.locator('#wave')).toHaveText('1');
  await expect(page.locator('#wave-toast')).toContainText('체력 완전 회복');
  await expect(page.locator('#health-text')).toHaveText('140 / 140');
  await expect(page.locator('#level')).toHaveText('08');
  await expect(page.locator('#xp-text')).toHaveText('7 / 37 · 19%');
  await expect(page.locator('[data-spell="lance"]')).toBeVisible();
  expect(await game.evaluate((run) => [run.player.x, run.player.z, run.enemies[0].hp, run.pickups[0].value])).toEqual([25, 2, 123, 8]);
  await game.evaluate((run) => { run.time += 6.5; });
  await expect(page.locator('#elapsed')).toHaveText(/03:0[6-8]/);
  await page.screenshot({ path: test.info().outputPath('aurora-caverns.png') });

  await game.evaluate((run, time) => { run.time = time - .01; }, STAGE_TIME + WAVE_TIME * (WAVE_COUNT - 1));
  await expect(page.locator('#wave-toast')).toContainText('프리즘 거상 등장!');
  await game.evaluate((run, boundary) => { run.time = boundary - .01; }, STAGE_TIME * 2);
  await expect(page.locator('#arena')).toHaveAttribute('data-stage', 'citadel');
  await expect(page.locator('#map-title')).toHaveText('달빛 성채');
  await expect(page.locator('#stage-number')).toHaveText(`3 / ${STAGES.length}`);
  await expect(page.locator('.stage-route [data-state="cleared"]')).toHaveCount(2);
  await expect(page.locator('#wave')).toHaveText('1');
  expect(await game.evaluate((run) => [run.player.x, run.player.z, run.enemies[0].hp, run.pickups[0].value])).toEqual([25, 2, 123, 8]);
  await game.evaluate((run) => { run.time += 6.5; });
  await expect(page.locator('#elapsed')).toHaveText(/06:0[6-8]/);
  await page.screenshot({ path: test.info().outputPath('moonlit-citadel.png') });

  await game.evaluate((run, time) => { run.time = time - .01; }, STAGE_TIME * 2 + WAVE_TIME * (WAVE_COUNT - 1));
  await expect(page.locator('#wave-toast')).toContainText('달서리 여왕 등장!');
  const bossText = await page.evaluateHandle(() => {
    const context = document.querySelector<HTMLCanvasElement>('#damage-canvas')!.getContext('2d')!;
    const seen: string[] = [];
    const fillText = context.fillText.bind(context);
    context.fillText = (text, x, y, maxWidth) => {
      if (text.startsWith('달서리 삼연타') && !seen.length) seen.push(text);
      if (maxWidth === undefined) fillText(text, x, y);
      else fillText(text, x, y, maxWidth);
    };
    return seen;
  });
  await game.evaluate((run) => {
    const queen = run.enemies.find((enemy) => enemy.kind === 'queen')!;
    Object.assign(run.player, { x: 0, z: 0, immunity: 15 });
    Object.assign(queen, { x: 0, z: -4.6, speed: 0, frozen: 0, attackAt: run.time + .01 });
    run.enemies = [queen];
    run.hazards.length = 0;
  });
  await expect.poll(() => game.evaluate((run) => run.hazards.length)).toBe(3);
  await expect.poll(() => bossText.evaluate((texts) => texts[0])).toMatch(/달서리 삼연타 · [0-9.]+초/);
  await page.screenshot({ path: test.info().outputPath('frost-queen-warning.png') });
  await bossText.dispose();
  for (const [index, stage] of STAGES.entries()) {
    if (index < 3) continue;
    await game.evaluate((run, boundary) => { run.time = boundary - .01; }, STAGE_TIME * index);
    await expect(page.locator('#arena')).toHaveAttribute('data-stage', stage.id);
    await expect(page.locator('#map-title')).toHaveText(stage.name);
    await expect(page.locator('#stage-number')).toHaveText(`${index + 1} / ${STAGES.length}`);
    await game.evaluate((run, boundary) => { run.time = boundary - .01; }, STAGE_TIME * index + WAVE_TIME * (WAVE_COUNT - 1));
    await expect(page.locator('#wave-toast')).toContainText(`${stage.boss.name} 등장!`);
  }
  await game.evaluate((run, finish) => { run.time = finish - .01; }, RUN_TIME);
  const dialog = page.getByRole('dialog');
  await expect(dialog).toHaveAccessibleName(`${STAGES.length}개 스테이지를 모두 버텼어요!`);
  await expect(dialog).toContainText(clock(RUN_TIME));
  await expect(dialog).toContainText(`${STAGES.length} / ${STAGES.length}`);
  await expect(dialog.locator('#reward-points')).toHaveText(`+${STAGES.length * 10} P`);
  await expect(page.locator('#best-time')).toHaveText(clock(RUN_TIME));
  await dialog.getByRole('button', { name: '다시 도전' }).click();
  await expect(page.locator('#arena')).toHaveAttribute('data-stage', 'grove');
  await expect(page.locator('#stage-number')).toHaveText(`1 / ${STAGES.length}`);
  await expect(page.locator('#level')).toHaveText('01');
  await expect(page.locator('#spell-count')).toHaveText(`1 / ${totalSpells}`);
  await game.dispose();
});

test('the first wave fills all twelve bearings without spawning in the active camera view', async ({ page }) => {
  await page.goto('/');
  const arrivals = await page.evaluateHandle(async () => {
    const { Combat } = await import(`${location.origin}/src/combat.ts`);
    type SpawnHook = {
      spawnAt(kind: Combat['enemies'][number]['kind'], x: number, z: number, questNpcId?: number): void;
      visibleSpawn(x: number, z: number, size: number): boolean;
    };
    const prototype = Combat.prototype as unknown as SpawnHook;
    const original = prototype.spawnAt;
    const recorded: { time: number; angle: number; visible: boolean }[] = [];
    prototype.spawnAt = function (this: Pick<Combat, 'enemies' | 'player' | 'time'> & SpawnHook, kind, x, z, questNpcId) {
      original.call(this, kind, x, z, questNpcId);
      const enemy = this.enemies.at(-1)!;
      if (this.time >= .5 && this.time < 2.5) {
        recorded.push({ time: this.time, angle: Math.atan2(enemy.x - this.player.x, enemy.z - this.player.z),
          visible: this.visibleSpawn(enemy.x, enemy.z, enemy.size) });
      }
    };
    return recorded;
  });
  const game = await beginRun(page);
  await expect.poll(() => arrivals.evaluate((points) => points.length)).toBeGreaterThanOrEqual(12);
  const ring = (await arrivals.jsonValue()).slice(0, 12);
  const sectors = new Set(ring.map(({ angle }) => ((Math.round(angle * 12 / (2 * Math.PI)) % 12) + 12) % 12));
  expect(sectors.size).toBe(12);
  expect(ring.every(({ visible }) => !visible)).toBe(true);
  expect(new Set(ring.map(({ time }) => time)).size).toBe(3);
  expect(await game.evaluate((run) => run.wave)).toBe(1);
  await game.dispose();
  await arrivals.dispose();
});

test('the fire class and offscreen spawning work across a continuous rendered map seam', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: '화염 마법사' }).click();
  await expect(page.locator('#arena')).toHaveAttribute('data-mage-class', 'fire');
  await expect(page.locator('.spell-card[data-spell="fireball"]')).toBeVisible();
  await page.locator('[data-spell="fireball"]').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('불덩이 작렬');
  await expect(dialog.locator('[data-entry="pyro"]')).toContainText('쿨타임 없음');
  await expect(dialog.locator('[data-entry="bolt"]')).toHaveCount(0);
  for (const [tier, count] of [['rare', 4], ['epic', 3], ['unique', 2]] as const) {
    await expect(dialog.locator(`.entry[data-rarity="${tier}"]`)).toHaveCount(count);
  }
  await page.keyboard.press('Escape');
  const view = await page.evaluateHandle(async () => {
    const { World } = await import(`${location.origin}/src/world/scene.ts`);
    const draw = World.prototype.draw;
    return new Promise<World>((resolve) => {
      World.prototype.draw = function (this: World, ...args: Parameters<World['draw']>) {
        World.prototype.draw = draw;
        draw.apply(this, args);
        resolve(this);
      };
    });
  });
  const game = await beginRun(page);
  const opening = await game.evaluate((run) => run.enemies.slice(0, 4).map(({ x, z, size }) => ({ x, z, size })));
  expect(opening).toHaveLength(4);
  expect(await view.evaluate((scene, enemies) => enemies.every(({ x, z, size }) => !scene.spawnVisible(x, z, size * .5)), opening)).toBe(true);
  await game.evaluate((run) => { Object.assign(run.enemies[0], { x: 0, z: -4, speed: 0 }); });
  await expect(page.locator('[data-spell="fireball"]')).toHaveClass(/cooling/);
  await expect(page.locator('#heat-status')).toBeVisible();
  await game.evaluate((run) => {
    run.heat = 2;
    run.spells.add('pyro');
    run.cooldown.fireball = 999;
    run.player.heading = 0;
    run.enemies.length = 1;
    Object.assign(run, { nextSpawn: Infinity });
    Object.assign(run.enemies[0], { x: 0, z: -4, hp: 500, maxHp: 500, speed: 0,
      ignite: { remaining: 40, ticks: 4, next: 20, sources: new Map([['fireball', 40]]) } });
  });
  await expect(page.locator('#heat-status')).toHaveAttribute('data-ready', 'true');
  const pyro = page.locator('[data-spell="pyro"]');
  await expect(pyro).toHaveClass(/hot-ready/);
  await expect(pyro).not.toHaveClass(/cooling/);
  await expect(pyro).toHaveCSS('--cooldown', '0%');
  await expect(page.locator('#effect-status')).toHaveText('작열 1명');
  await game.evaluate((run, halfX) => {
    Object.assign(run.player, { x: halfX - 1.2, z: 0, heading: Math.PI / 2, immunity: 60 });
    run.enemies.length = 0;
    run.supplies = [{ x: -halfX + 9, z: 0, kind: 'heart', expires: run.time + 60 }];
  }, FIELD_X);
  await page.keyboard.press('c');
  const cameraX = () => view.evaluate((scene) => (scene as unknown as { camera: { view: { position: { x: number } } } }).camera.view.position.x);
  await expect.poll(cameraX).toBeGreaterThan(FIELD_X - 14);
  await page.keyboard.down('w');
  try {
    await expect.poll(() => game.evaluate((run) => run.player.x)).toBeGreaterThan(FIELD_X + 2);
  } finally {
    await page.keyboard.up('w');
  }
  await expect.poll(cameraX).toBeGreaterThan(FIELD_X - 10);
  await page.screenshot({ path: test.info().outputPath('continuous-frontier.png') });
  await page.keyboard.press('m');
  await expect(dialog.locator('[data-map-marker="player"]')).toHaveAttribute('transform', /^translate\(240 180\)/);
  const heart = await dialog.locator('[data-map-marker="heart"]').getAttribute('transform');
  expect(Number(heart?.match(/translate\(([\d.]+)/)?.[1])).toBeCloseTo(242, -1);
  await page.keyboard.press('m');
  await expect(dialog).toBeHidden();
  expect(errors).toEqual([]);
  await view.dispose();
  await game.dispose();
});

test('both procedural fallback mages use the eye and mouth details from the approved art', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const textures = await page.evaluate(async () => {
    const { makeMage } = await import(`${location.origin}/src/world/actors.ts`);
    const classes = ['frost', 'fire'] as const;
    return Promise.all(classes.map(async (id) => {
      const mage = makeMage(id);
      const image = await mage.ready;
      const eye = mage.root.getObjectByName('lumi-open-eye') as Mesh<BufferGeometry, MeshBasicMaterial>;
      const smile = mage.root.getObjectByName('lumi-smile') as Mesh<BufferGeometry, MeshBasicMaterial>;
      return image ? {
        width: image.naturalWidth, path: new URL(image.src).pathname,
        eyeApplied: (eye.material.map?.version ?? 0) > 1,
        smileApplied: (smile.material.map?.version ?? 0) > 1,
      } : null;
    }));
  });
  expect(textures).toEqual([
    { width: 384, path: '/art/lumi-eye-ice.png', eyeApplied: true, smileApplied: true },
    { width: 384, path: '/art/lumi-eye-fire.png', eyeApplied: true, smileApplied: true },
  ]);
});

test('switching mages removes the old character immediately and does not mount a loading fallback', async ({ page }) => {
  let release!: () => void;
  const waitForFire = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/art/red-hood-magician.glb', async (route) => {
    await waitForFire;
    await route.continue();
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  try {
    await expect(page.locator('#start')).toBeEnabled();
    const view = await page.evaluateHandle(async () => {
      const { World } = await import(`${location.origin}/src/world/scene.ts`);
      const draw = World.prototype.draw;
      return new Promise<World>((resolve) => {
        World.prototype.draw = function (this: World, ...args: Parameters<World['draw']>) {
          World.prototype.draw = draw;
          draw.apply(this, args);
          resolve(this);
        };
      });
    });
    await page.getByRole('button', { name: '화염 마법사' }).click();
    await expect(page.locator('#mage-model-status')).toContainText('불러오는 중');
    await expect(page.locator('#start')).toBeDisabled();
    const mounted = () => view.evaluate((world) => {
      const { scene } = world as unknown as { scene: import('three').Scene };
      const frost = scene.getObjectByName('lumi-player'), fire = scene.getObjectByName('fire-mage-player');
      return { frost: Boolean(frost), fire: fire?.children.map((node) => node.name) ?? null };
    });
    expect(await mounted()).toEqual({ frost: false, fire: [] });
    await page.getByRole('button', { name: '냉기 마법사' }).click();
    const loaded = page.waitForResponse((response) => response.url().endsWith('/art/red-hood-magician.glb') && response.ok());
    release();
    await loaded;
    expect(await mounted()).toEqual({ frost: true, fire: null });
    await page.getByRole('button', { name: '화염 마법사' }).click();
    await expect(page.locator('#start')).toBeEnabled();
    await expect(page.locator('#mage-model-status')).toBeHidden();
    expect(await mounted()).toEqual({ frost: false, fire: ['red-hood-magician'] });
    await view.dispose();
  } finally { release(); }
});

test('the game uses the Meshy model, and the cape runs on its own joints while the boots retain leg weights', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const view = await page.evaluateHandle(async () => {
    const { World } = await import(`${location.origin}/src/world/scene.ts`);
    const draw = World.prototype.draw;
    return new Promise<World>((resolve) => {
      World.prototype.draw = function (this: World, ...args: Parameters<World['draw']>) {
        World.prototype.draw = draw;
        draw.apply(this, args);
        resolve(this);
      };
    });
  });
  const rest = await view.evaluate(async (scene) => {
    const actor = (scene as unknown as { mage: ReturnType<typeof import('../src/world/lumi-meshy').makePlayableMage> }).mage;
    const loaded = await actor.ready;
    const { geometry, skeleton } = actor.root.getObjectByName('char1') as import('three').SkinnedMesh;
    const { position, skinIndex, skinWeight } = geometry.attributes;
    const joints = (x: number, y: number) => {
      for (let i = 0; i < position.count; i++) if (Math.abs(position.getX(i)) > x && position.getY(i) < y) {
        return [0, 1, 2, 3].filter((j) => skinWeight.getComponent(i, j) > .001)
          .map((j) => skeleton.bones[skinIndex.getComponent(i, j)].name);
      }
      return [];
    };
    const boot = [...Array(position.count).keys()].find((i) => Math.abs(position.getX(i)) < .07 && position.getY(i) < .03)!;
    const cape = actor.root.getObjectByName('LumiCapeRoot')!;
    return { loaded, cape: joints(.49, .22), boot: skeleton.bones[skinIndex.getX(boot)].name, q: cape.quaternion.toArray() };
  });
  expect(rest.loaded).toBe(true);
  expect(rest.cape.length).toBeGreaterThan(0);
  expect(rest.cape.every((name) => name.startsWith('LumiCape'))).toBe(true);
  expect(rest.boot).toMatch(/(Foot|ToeBase)$/);
  const game = await beginRun(page);
  await page.keyboard.down('KeyW');
  try {
    await expect.poll(() => view.evaluate((scene, start) => {
      const root = (scene as unknown as { mage: { root: import('three').Group } }).mage.root;
      const q = root.getObjectByName('LumiCapeRoot')!.quaternion;
      return Math.abs(q.x * start[0] + q.y * start[1] + q.z * start[2] + q.w * start[3]);
    }, rest.q)).toBeLessThan(.997);
  } finally {
    await page.keyboard.up('KeyW');
  }
  expect(errors).toEqual([]);
  await game.dispose();
  await view.dispose();
});

for (const missing of [false, true]) {
  test(missing ? 'a missing Puff GLB leaves the procedural enemy playable' : 'the Meshy Puff is textured, grounded and instanced in the menu and the first wave', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    if (missing) await page.route('**/art/puff-slime.glb', (route) => route.fulfill({ status: 404, body: 'not found' }));
    const glb = page.waitForResponse((response) => response.url().endsWith('/art/puff-slime.glb'));
    await page.goto('/');
    expect((await glb).status()).toBe(missing ? 404 : 200);
    const observed = await page.evaluateHandle(async () => {
      const { World } = await import(`${location.origin}/src/world/scene.ts`);
      const draw = World.prototype.draw;
      const seen = { menu: false, firstWave: false, textured: false, grounded: false, triangles: 0 };
      World.prototype.draw = function (this: World, ...args: Parameters<World['draw']>) {
        draw.apply(this, args);
        const { enemies } = this as unknown as { enemies: Map<'puff', import('three').InstancedMesh<BufferGeometry, import('three').MeshStandardMaterial>[]> };
        const puff = enemies.get('puff')?.[0];
        if (!puff?.isInstancedMesh || puff.count < 1) return;
        seen.menu ||= !args[0];
        seen.firstWave ||= args[0]?.stageIndex === 0 && args[0].wave === 1;
        seen.textured = Boolean(puff.material.map) && puff.geometry.name === 'meshy-puff-slime';
        const bounds = puff.geometry.boundingBox;
        seen.grounded = Boolean(bounds && Math.abs(bounds.min.y) < .001 && bounds.max.y <= 1.071);
        seen.triangles = (puff.geometry.index?.count ?? puff.geometry.attributes.position.count) / 3;
      };
      return seen;
    });
    await expect.poll(() => observed.jsonValue()).toMatchObject(missing
      ? { menu: true, textured: false }
      : { menu: true, textured: true, grounded: true, triangles: 1657 });

    const game = await beginRun(page);
    await game.evaluate((run) => {
      run.enemies = run.enemies.filter((enemy) => enemy.kind === 'puff').slice(0, 3);
      run.enemies.forEach((enemy, i) => Object.assign(enemy, { x: (i - 1) * 1.95, z: -3.25 - i * .9, speed: 0 }));
      run.cooldown.bolt = 300;
    });
    await expect.poll(() => observed.jsonValue()).toMatchObject({ firstWave: true, textured: !missing });
    expect(await game.evaluate((run) => run.enemies.some((enemy) => enemy.kind === 'puff' && enemy.radius === .55 && enemy.maxHp === 27))).toBe(true);
    if (!missing) await page.locator('#arena').screenshot({
      path: test.info().outputPath('puff-slime-first-wave.png'),
      style: '#wave-toast, #damage-canvas { visibility: hidden; }',
    });
    expect(errors).toEqual([]);
    await game.dispose();
    await observed.dispose();
  });
}

for (const missing of [false, true]) {
  test(missing ? 'snowfield stays playable if a terrain GLB is missing' : 'winter props are instanced, the snow drifts, and the trees follow the wrapped world', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    if (missing) await page.route('**/art/snow-fir.glb', (route) => route.fulfill({ status: 404, body: 'not found' }));
    const assets = ['snow-fir.glb', 'snow-boulder.glb'].map((name) => page.waitForResponse((response) => response.url().endsWith(`/art/${name}`)));
    await page.goto('/');
    expect((await Promise.all(assets)).map((response) => response.status())).toEqual(missing ? [404, 200] : [200, 200]);
    const observed = await page.evaluateHandle(async () => {
      const { World } = await import(`${location.origin}/src/world/scene.ts`);
      const draw = World.prototype.draw;
      const seen = { firs: 0, rocks: 0, firTriangles: 0, rockTriangles: 0, textured: true, sheetX: 0, sheetZ: 0,
        spindrift: false, snowX: 0, grounded: false };
      World.prototype.draw = function (this: World, ...args: Parameters<World['draw']>) {
        draw.apply(this, args);
        const { scene } = this as unknown as { scene: import('three').Scene };
        let firs = 0, rocks = 0;
        scene.traverse((object) => {
          if (object.name === 'winter-spindrift' && object.visible && object.renderOrder < 0) seen.spindrift = true;
          if (!object.name.startsWith('meshy-snow-')) return;
          const mesh = object as import('three').InstancedMesh<BufferGeometry, import('three').MeshStandardMaterial>;
          if (!mesh.isInstancedMesh || !mesh.material.map) seen.textured = false;
          const triangles = (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3;
          if (mesh.name === 'meshy-snow-fir') {
            firs += mesh.count;
            seen.firTriangles = triangles;
            seen.sheetX = mesh.parent!.position.x;
            seen.sheetZ = mesh.parent!.position.z;
            if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
            seen.grounded = Math.abs(mesh.geometry.boundingBox!.min.y) < .001;
          } else if (mesh.name === 'meshy-snow-boulder') {
            rocks += mesh.count;
            seen.rockTriangles = triangles;
          }
        });
        seen.firs = firs; seen.rocks = rocks;
        const snow = scene.getObjectByName('winter-snowflakes') as import('three').Points;
        if (snow) seen.snowX = snow.geometry.attributes.position.getX(0);
      };
      return seen;
    });
    await expect.poll(() => observed.jsonValue()).toMatchObject({ textured: true, rockTriangles: 544, spindrift: true });
    if (missing) expect((await observed.jsonValue()).firs).toBe(0);
    else {
      await expect.poll(() => observed.jsonValue()).toMatchObject({ firTriangles: 993, grounded: true });
      expect((await observed.jsonValue()).firs).toBeGreaterThan(30);
    }
    expect((await observed.jsonValue()).rocks).toBeGreaterThan(60);
    const game = await beginRun(page);
    const firstTree = await game.evaluate((run) => run['terrainObstacles'][0]);
    expect(firstTree).toMatchObject({ x: -14, z: -5.6, radius: expect.closeTo(.45 * 1.3), canopy: { height: expect.closeTo(3.66 * 1.3) } });
    if (!missing) {
      const before = await observed.jsonValue();
      await expect.poll(() => observed.evaluate(({ snowX }) => snowX)).not.toBe(before.snowX);
      await game.evaluate((run, [x, z]) => { run.player.x += x; run.player.z += z; }, [FIELD_X * 2, FIELD_Z * 2]);
      await expect.poll(() => observed.jsonValue()).toMatchObject({ sheetX: FIELD_X * 2, sheetZ: FIELD_Z * 2 });
    }
    expect(errors).toEqual([]);
    await game.dispose();
    await observed.dispose();
  });
}

for (const [id, model, kind, grip] of [
  ['frost', 'lumi-meshy', 'bolt', 'mixamorigRightHand'],
  ['fire', 'red-hood-magician', 'fireball', 'RightHand'],
] as const) {
  test(`${id} uses its own rig and launches its starter projectile from the staff crystal`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    if (id === 'fire') {
      await page.getByRole('button', { name: '화염 마법사' }).click();
      await expect(page.locator('#character-name')).toHaveText('붉은 후드');
    }
    const observed = await page.evaluateHandle(async ({ model, kind }) => {
      const { World } = await import(`${location.origin}/src/world/scene.ts`);
      const draw = World.prototype.draw;
      const result = { from: null as number[] | null, crystal: null as number[] | null, grip: '', ready: false };
      World.prototype.draw = function (this: World, ...args: Parameters<World['draw']>) {
        draw.apply(this, args);
        const state = this as unknown as { mage: { root: import('three').Group }; bolt: import('three').InstancedMesh;
          fireShots: import('three').InstancedMesh };
        result.ready = Boolean(state.mage.root.getObjectByName(model));
        const projectile = kind === 'bolt' ? state.bolt : state.fireShots;
        if (!result.ready || !args[0]?.shots.some((shot) => shot.kind === kind && (shot.age ?? -1) >= 0) || !projectile.count) return;
        const staff = state.mage.root.getObjectByName('lumi-staff')!;
        const gem = state.mage.root.getObjectByName('lumi-staff-tip')!;
        const elements = projectile.instanceMatrix.array;
        result.from = [elements[12], elements[13], elements[14]];
        result.crystal = gem.getWorldPosition(gem.position.clone()).toArray();
        result.grip = staff.parent!.name;
        World.prototype.draw = draw;
      };
      return result;
    }, { model, kind });
    await expect.poll(() => observed.evaluate((value) => value.ready)).toBe(true);
    const game = await beginRun(page);
    await game.evaluate((run, kind) => {
      run.enemies.length = 1;
      Object.assign(run.enemies[0], { x: 0, z: -7, hp: 3000, maxHp: 3000, speed: 0 });
      if (!run.shots.some((shot) => shot.age !== undefined && shot.age >= 0)) {
        run.shots.length = 0;
        run.cooldown[kind] = 0;
      }
    }, kind);
    await expect.poll(() => observed.evaluate((value) => value.from)).not.toBeNull();
    const result = await observed.jsonValue();
    expect(result.grip).toBe(grip);
    for (let i = 0; i < 3; i++) expect(result.from![i]).toBeCloseTo(result.crystal![i], 5);
    expect(errors).toEqual([]);
    await game.dispose();
    await observed.dispose();
  });
}

test('the Meshy frost effects render detailed ice, a glacial fracture, airborne shards and lingering mist', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && message.text().includes('THREE.WebGLProgram')) errors.push(message.text());
  });
  const assets = ['frost-shard.glb', 'frost-burst.glb'].map((name) =>
    page.waitForResponse((response) => response.url().endsWith(`/art/${name}`) && response.ok()));
  await page.goto('/');
  await Promise.all(assets);
  const rendered = await page.evaluateHandle(async () => {
    const { World } = await import(`${location.origin}/src/world/scene.ts`);
    const draw = World.prototype.draw;
    const seen = { shard: false, spear: false, crown: false, ribbon: false, sigil: false,
      fracture: false, iceFragments: false, mist: false, settled: false };
    World.prototype.draw = function (this: World, ...args: Parameters<World['draw']>) {
      draw.apply(this, args);
      const art = this as unknown as { scene: import('three').Scene;
        bolt: import('three').InstancedMesh; lance: import('three').InstancedMesh; frostTrail: import('three').InstancedMesh };
      seen.shard ||= art.bolt.count > 0 && art.bolt.geometry.name === 'meshy-frost-shard' &&
        (art.bolt.material as import('three').Material).name === 'prismatic-frost-ice';
      seen.spear ||= art.lance.count > 0 && art.lance.geometry.name === 'meshy-frost-shard';
      const impact = art.scene.getObjectByName('absolute-zero-glacial-impact');
      const count = (name: string) => (impact?.getObjectByName(name) as import('three').InstancedMesh | undefined)?.count ?? 0;
      seen.crown ||= count('meshy-ice-crystal-burst') >= 10;
      seen.ribbon ||= art.frostTrail.count > 0;
      seen.sigil ||= Boolean(art.scene.getObjectByName('frost-sigil'));
      seen.fracture ||= Boolean(impact?.getObjectByName('absolute-zero-ice-ground'));
      seen.iceFragments ||= count('absolute-zero-airborne-shards') >= 12;
      seen.mist ||= count('absolute-zero-frost-vapor') >= 6;
      seen.settled ||= seen.mist && !impact;
    };
    return seen;
  });
  const game = await beginRun(page);
  const sigil = page.waitForResponse((response) => response.url().endsWith('/art/absolute-zero.png') && response.ok());
  await game.evaluate((run) => {
    run.enemies = run.enemies.slice(0, 3);
    run.enemies.forEach((enemy, i) => {
      Object.assign(enemy, { x: (i - 1) * 2.0, z: -3.6, hp: 3000, maxHp: 3000, speed: 0 });
    });
    run.spells.add('absoluteZero');
    run.cooldown.bolt = 999;
    const shot = { z: -2.1, vx: 0, vz: 0, life: 6, hits: new Set<number>() };
    run.shots.push({ ...shot, x: -1.82, kind: 'bolt', charged: false }, { ...shot, x: 1.82, kind: 'lance', charged: true });
    run.cast('absoluteZero', null, { x: 0, z: 0 });
  });
  await sigil;
  await expect(page.locator('[data-spell="absoluteZero"]')).toHaveAttribute('data-rarity', 'unique');
  await expect(page.locator('#effect-status')).toContainText('빙결 3');
  await expect.poll(() => rendered.jsonValue()).toMatchObject({ shard: true, spear: true, crown: true,
    ribbon: true, sigil: true, fracture: true, iceFragments: true, mist: true });
  await page.locator('#arena').screenshot({
    path: test.info().outputPath('absolute-zero-glacial-impact.png'),
    style: '#wave-toast, #damage-canvas { visibility: hidden; }',
  });
  await expect.poll(() => rendered.evaluate(({ settled }) => settled)).toBe(true);
  expect(errors).toEqual([]);
  await game.dispose();
  await rendered.dispose();
});

for (const [classId, book] of [['frost', SPELLS], ['fire', FIRE_SPELLS]] as const) {
  test(`every ${classId} spell creates a signature effect in the rendered game`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && message.text().includes('THREE.WebGLProgram')) errors.push(message.text());
    });
    await page.goto('/');
    if (classId === 'fire') await page.getByRole('button', { name: '화염 마법사' }).click();
    const observed = await page.evaluateHandle(async () => {
      const { World } = await import(`${location.origin}/src/world/scene.ts`);
      const add = World.prototype.addEvent, draw = World.prototype.draw;
      const seen = { casts: new Set<string>(), molten: false, phoenix: false, field: false, ward: false,
        explosion: false, craterPlumes: false };
      type Art = { scene: import('three').Scene; fireShots: import('three').InstancedMesh;
        meteor: import('three').InstancedMesh; phoenix: import('three').InstancedMesh };
      World.prototype.addEvent = function (this: World, ...args: Parameters<World['addEvent']>) {
        const [event] = args;
        const { scene } = this as unknown as Art;
        const before = event.kind === 'cast' ? new Set(scene.children.map((object) => object.id)) : undefined;
        add.apply(this, args);
        if (event.kind === 'cast' && scene.children.some((object) => !before!.has(object.id) &&
          /spell-etch|spell-ribbon|spell-arc/.test(object.name))) {
          seen.casts.add(event.spell);
        }
        if (event.kind === 'spell-impact' && event.spell === 'meteor') seen.explosion = true;
      };
      World.prototype.draw = function (this: World, ...args: Parameters<World['draw']>) {
        draw.apply(this, args);
        const { scene, fireShots, meteor, phoenix } = this as unknown as Art;
        seen.molten ||= fireShots.count > 0 || meteor.count > 0;
        seen.phoenix ||= phoenix.count > 0;
        seen.field ||= Boolean(scene.children.find((node) => node.name.startsWith('spell-field-') && node.visible));
        seen.ward ||= Boolean(scene.children.find((node) => node.name.endsWith('barrier-ward') && node.visible));
        const thermal = scene.getObjectByName('meteor-thermal-impact');
        const layerCount = (name: string) => (thermal?.getObjectByName(name) as import('three').InstancedMesh | undefined)?.count ?? 0;
        seen.craterPlumes ||= layerCount('meteor-ejected-molten-rock') > 14 &&
          layerCount('meteor-flame-plumes') === 7 && layerCount('meteor-rolling-ash') === 5;
      };
      return seen;
    });
    const game = await beginRun(page);
    for (const { id } of book) {
      const cast = await game.evaluate((run, spell) => {
        const enemy = run.enemies[0];
        Object.assign(run.player, { x: 0, z: 0, heading: Math.PI, immunity: 80, casting: 0 });
        Object.assign(run, { nextSpawn: Infinity, barrier: 0, barrierTime: 0, heat: spell === 'pyro' ? 2 : 0, combustion: 0, inferno: 0 });
        run.enemies = [-1.9, 0, 1.9, 3.8].map((x, i) => ({
          ...enemy, id: 500 + i, kind: 'puff', attackAt: undefined, x, z: -3.7, speed: 0, hp: 2500, maxHp: 2500, born: -10,
          frozen: spell === 'glacialCollapse' ? 3 : 0, slow: ['frostBind', 'winterMoon', 'chainLightning'].includes(spell) ? 3 : 0,
          chills: undefined, ignite: ['flashpoint', 'supernova', 'emberBrand', 'livingBomb'].includes(spell)
            ? { remaining: 84, ticks: 4, next: 10, sources: new Map([['fireball', 84]]) } : undefined,
        }));
        run.shots = []; run.storms = []; run.orbs = []; run.impacts = []; run.walls = []; run.comets = []; run.bombs = [];
        run.spells.clear();
        run.spells.add(spell);
        for (const key of Object.keys(run.cooldown) as (keyof Combat['cooldown'])[]) run.cooldown[key] = 999;
        run.cooldown[spell] = 0;
        if (spell === 'bolt' || spell === 'fireball') { run.step(.02, { x: 0, z: 0 }); return true; }
        return run.cast(spell, null, { x: 0, z: -1 });
      }, id);
      expect(cast, id).toBe(true);
      await expect.poll(() => observed.evaluate(({ casts }, spell) => casts.has(spell), id), { message: id }).toBe(true);
      if (id === 'phoenix') await expect.poll(() => observed.evaluate(({ phoenix }) => phoenix)).toBe(true);
      if (id === 'meteor') {
        await expect.poll(() => observed.evaluate(({ molten }) => molten)).toBe(true);
        await expect.poll(() => observed.evaluate(({ explosion }) => explosion)).toBe(true);
        await expect.poll(() => observed.evaluate(({ craterPlumes }) => craterPlumes)).toBe(true);
        await page.locator('#arena').screenshot({
          path: test.info().outputPath('molten-meteor-impact.png'),
          style: '#wave-toast, #damage-canvas { visibility: hidden; }',
        });
      }
    }
    expect(await observed.evaluate(({ field, ward }) => ({ field, ward }))).toEqual({ field: true, ward: true });
    expect(errors).toEqual([]);
    await game.dispose();
    await observed.dispose();
  });
}

test('enemies within 30m have red health bars and numeric health even with floating damage numbers off', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('frostfall.numbers', 'off'));
  await page.goto('/');
  const frame = await page.evaluateHandle(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#damage-canvas')!;
    const context = canvas.getContext('2d')!;
    const state = {
      labels: [] as string[],
      bars: [] as { width: number; height: number }[],
    };
    const clear = context.clearRect.bind(context);
    const text = context.fillText.bind(context);
    const rect = context.fillRect.bind(context);
    context.clearRect = (...args) => {
      state.labels.length = 0;
      state.bars.length = 0;
      clear(...args);
    };
    context.fillText = (label, x, y, maxWidth) => {
      state.labels.push(label);
      if (maxWidth === undefined) text(label, x, y);
      else text(label, x, y, maxWidth);
    };
    context.fillRect = (x, y, width, height) => {
      if (context.fillStyle === '#eb4055') state.bars.push({ width, height });
      rect(x, y, width, height);
    };
    return state;
  });
  const game = await beginRun(page);
  await game.evaluate((run) => {
    const kinds = ['puff', 'hare', 'imp', 'warden'] as const;
    const health = [[24, 48], [17, 35], [41, 82], [230, 460]];
    const positions = [[-4, 0], [0, -3], [4, 0], [0, 5]];
    const template = run.enemies[0];
    run.enemies = kinds.map((kind, i) => ({
      ...template, id: 1000 + i,
      kind, hp: health[i][0], maxHp: health[i][1],
      x: positions[i][0], z: positions[i][1], speed: 0, frozen: 60,
      size: i === 3 ? 2.3 : 1,
    }));
    run.cooldown.bolt = 60;
    run.shots.length = 0;
  });
  for (const label of ['24 / 48', '17 / 35', '41 / 82', '230 / 460']) {
    await expect.poll(() => frame.evaluate((state) => state.labels)).toContain(label);
  }
  await expect(page.locator('#effect-status')).toHaveText('둔화 0 · 빙결 4');
  await expect.poll(() => frame.evaluate((state) => state.labels.some((label) => label.startsWith('빙결 ')))).toBe(true);
  await expect.poll(() => frame.evaluate((state) =>
    state.bars.some((bar) => bar.height === 16 && Math.abs(bar.width - 36) < .01))).toBe(true);
  await expect.poll(() => frame.evaluate((state) =>
    state.bars.some((bar) => bar.height === 20 && Math.abs(bar.width - 50) < .01))).toBe(true);
  await page.screenshot({ path: test.info().outputPath('enemy-health-bars.png') });

  await game.evaluate((run) => { run.enemies[1].hp = run.enemies[1].maxHp; });
  await expect.poll(() => frame.evaluate((state) => state.labels)).toContain('35 / 35');
  await game.evaluate((run) => { run.enemies[0].hp = 12; });
  await expect.poll(() => frame.evaluate((state) => state.labels)).toContain('12 / 48');
  await expect.poll(() => frame.evaluate((state) =>
    state.bars.some((bar) => bar.height === 16 && Math.abs(bar.width - 18) < .01))).toBe(true);
  for (const [z, visible] of [[-30, true], [-31, false], [-29, true]] as const) {
    await game.evaluate((run, z) => { Object.assign(run.enemies[0], { x: 0, z }); }, z);
    await expect.poll(() => frame.evaluate((state) => state.labels.includes('12 / 48'))).toBe(visible);
  }
  await game.evaluate((run) => { run.enemies[0].hp = 0; });
  await expect.poll(() => frame.evaluate((state) => state.labels)).not.toContain('12 / 48');
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').getByRole('button', { name: '전장 나가기' }).click();
  await expect.poll(() => frame.evaluate((state) => state.labels.length + state.bars.length)).toBe(0);
  await game.dispose();
  await frame.dispose();
});
