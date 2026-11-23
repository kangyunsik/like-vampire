import { expect, test } from '@playwright/test';

test('Fire is selected on the left by default and a saved Frost choice is kept', async ({ page }) => {
  await page.goto('/');
  const choices = page.getByRole('group', { name: '마법사 특성 선택' });
  const fire = choices.getByRole('button', { name: '화염 마법사' });
  const frost = choices.getByRole('button', { name: '냉기 마법사' });
  await expect(choices.getByRole('button')).toHaveText(['화염 마법사', '냉기 마법사']);
  await expect(fire).toHaveAttribute('aria-pressed', 'true');
  await expect(frost).toHaveAttribute('aria-pressed', 'false');
  expect((await fire.boundingBox())!.x).toBeLessThan((await frost.boundingBox())!.x);
  await expect(page.locator('#character-name')).toHaveText('붉은 후드');
  const start = page.getByRole('button', { name: /모험 시작/ });
  await start.click();
  await expect(page.locator('#arena')).toHaveAttribute('data-state', 'playing');
  await expect(page.locator('[data-spell="fireball"]')).toBeVisible();

  await page.reload();
  await frost.click();
  await expect(start).toBeEnabled();
  await page.reload();
  await expect(frost).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#character-name')).toHaveText('루미');
});
