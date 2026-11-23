import { expect, test, type Page } from '@playwright/test';

async function startAndOpenGardenerDialogue(page: Page) {
  await page.goto('/');
  await page.getByTestId('garden-start').click();
  await expect(page.getByTestId('scene-village')).toBeVisible();
  const gardener = page.getByTestId('target-gardener');
  if ((await gardener.getAttribute('data-nearby')) !== 'true') {
    await gardener.click();
    await expect(gardener).toHaveAttribute('data-nearby', 'true');
  }
  await expect(gardener).toBeFocused();
  await gardener.click();
  await expect(page.getByTestId('dialogue-panel')).toBeVisible();
  return gardener;
}

test('contains dialogue keyboard focus and restores it when Escape closes the modal', async ({
  page,
}) => {
  const gardener = await startAndOpenGardenerDialogue(page);
  const modal = page.getByTestId('dialogue-layer');
  const firstChoice = page.getByTestId('dialogue-choice-listen-gardener');
  const secondChoice = page.getByTestId('dialogue-choice-meet-traveler');
  const exit = page.getByTestId('dialogue-exit');

  expect(
    await modal.evaluate(
      (element) =>
        element instanceof HTMLDialogElement && element.open && element.matches(':modal'),
    ),
  ).toBe(true);
  await expect(firstChoice).toBeFocused();

  await page.getByTestId('garden-new-game').focus();
  await expect
    .poll(() => modal.evaluate((element) => element.contains(document.activeElement)))
    .toBe(true);

  await firstChoice.focus();
  await page.keyboard.press('Tab');
  await expect(secondChoice).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(exit).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(firstChoice).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(exit).toBeFocused();

  await firstChoice.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('dialogue-choice-help-gardener')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);
  await expect(gardener).toBeFocused();
});

test('outside taps dismiss the modal without activating the inert game background', async ({
  page,
}) => {
  await startAndOpenGardenerDialogue(page);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  const newGame = page.getByTestId('garden-new-game');
  const box = await newGame.boundingBox();
  expect(box).not.toBeNull();

  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await expect(page.getByTestId('dialogue-layer')).toHaveCount(0);
  await expect(page.getByTestId('reset-panel')).toHaveCount(0);
  await expect(page.getByTestId('scene-village')).toBeVisible();
});
