import { expect, test, type Page } from '@playwright/test';

async function start(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('garden-start')).toBeVisible();
  await page.getByTestId('garden-start').click();
  await expect(page.getByTestId('garden-canvas')).toBeVisible();
  await expect(page.getByTestId('scene-village')).toBeVisible();
}

async function interact(page: Page, targetId: string) {
  const target = page.getByTestId(`target-${targetId}`);
  if ((await target.getAttribute('data-nearby')) !== 'true') {
    await target.click();
    await expect(target).toHaveAttribute('data-nearby', 'true');
  }
  await target.click();
}

async function enterGarden(page: Page) {
  await interact(page, 'garden-gate');
  await expect(page.getByTestId('scene-garden')).toBeVisible();
  await expect(page.getByTestId('active-map')).toHaveText('باغ خاموش');
  await expect.poll(() => page.evaluate(() => window.__gardenProbe?.activeMap)).toBe('garden');
}

test('completes the gardener quest and renders a grown tree ending', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await start(page);

  await interact(page, 'gardener');
  await expect(page.getByTestId('dialogue-panel')).toContainText('چراغ باغ خاموش شده است');
  await page.getByTestId('dialogue-choice-listen-gardener').click();
  await expect(page.getByTestId('dialogue-panel')).toContainText('یک دانه ویژه دارم');
  await page.getByTestId('dialogue-choice-help-gardener').click();
  await expect(page.getByTestId('dialogue-panel')).toHaveCount(0);
  await expect(page.getByTestId('quest-status')).toContainText('سبد دانه‌ها را در روستا پیدا کن');

  await interact(page, 'seed-basket');
  await expect(page.getByTestId('quest-status')).toContainText('دانه را در بستر باغ بکار');
  await enterGarden(page);
  await interact(page, 'planting-bed');
  await expect(page.getByTestId('ending-panel')).toContainText('دانه جوانه زد و باغ دوباره سبز شد');
  await expect
    .poll(() =>
      page.evaluate(() => window.__gardenProbe?.renderedConsequences.includes('grown-tree')),
    )
    .toBe(true);

  await page.getByTestId('ending-close').click();
  await interact(page, 'village-gate');
  await enterGarden(page);
  await expect
    .poll(() =>
      page.evaluate(() => window.__gardenProbe?.renderedConsequences.includes('grown-tree')),
    )
    .toBe(true);
  expect(pageErrors).toEqual([]);
});

test('completes the traveler quest and renders a lit lantern ending', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await start(page);

  await interact(page, 'traveler');
  await page.getByTestId('dialogue-choice-meet-traveler').click();
  await expect(page.getByTestId('dialogue-panel')).toContainText('نشانی روی سنگ پنهان است');
  await page.getByTestId('dialogue-choice-follow-light').click();
  await expect(page.getByTestId('dialogue-panel')).toHaveCount(0);
  await expect(page.getByTestId('quest-status')).toContainText('نشانه پنهان را در باغ پیدا کن');

  await enterGarden(page);
  await interact(page, 'ancient-lantern');
  await expect(page.getByTestId('ending-panel')).toHaveCount(0);
  await interact(page, 'clue-stone');
  await expect(page.getByTestId('quest-status')).toContainText('فانوس کهن را روشن کن');
  await interact(page, 'ancient-lantern');
  await expect(page.getByTestId('ending-panel')).toContainText('فانوس روشن شد و نور به باغ برگشت');
  await expect
    .poll(() =>
      page.evaluate(() => window.__gardenProbe?.renderedConsequences.includes('lit-lantern')),
    )
    .toBe(true);
  expect(pageErrors).toEqual([]);
});
