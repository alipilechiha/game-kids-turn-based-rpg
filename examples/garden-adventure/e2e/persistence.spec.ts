import { expect, test, type Page } from '@playwright/test';

const saveKey = 'waypoint-rpg:garden-adventure:save';

async function startFresh(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('garden-start')).toBeVisible();
  await page.getByTestId('garden-start').click();
  await expect(page.getByTestId('garden-canvas')).toBeVisible();
}

async function interact(page: Page, targetId: string) {
  const target = page.getByTestId(`target-${targetId}`);
  if ((await target.getAttribute('data-nearby')) !== 'true') {
    await target.click();
    await expect(target).toHaveAttribute('data-nearby', 'true');
  }
  await target.click();
}

async function completeGardenerEnding(page: Page) {
  await interact(page, 'gardener');
  await page.getByTestId('dialogue-choice-listen-gardener').click();
  await page.getByTestId('dialogue-choice-help-gardener').click();
  await interact(page, 'seed-basket');
  await interact(page, 'garden-gate');
  await interact(page, 'planting-bed');
  await expect(page.getByTestId('ending-panel')).toBeVisible();
}

test('continues a saved ending on its map and restores its rendered tree', async ({ page }) => {
  await startFresh(page);
  await completeGardenerEnding(page);
  await page.getByTestId('ending-close').click();

  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? 'null'),
    saveKey,
  );
  expect(saved).toMatchObject({
    schemaVersion: 1,
    gameId: 'garden-adventure',
    mapId: 'garden',
    anchorId: 'garden-bed',
    narrative: {
      quests: { 'gardener-quest': 'completed' },
      facts: { 'tree-grown': true, 'garden-outcome': 'tree' },
      endingId: 'ending-garden',
    },
  });

  await page.reload();
  await expect(page.getByTestId('garden-continue')).toBeVisible();
  await page.getByTestId('garden-continue').click();
  await expect(page.getByTestId('scene-garden')).toBeVisible();
  await expect(page.getByTestId('ending-panel')).toContainText('دانه جوانه زد');
  await expect
    .poll(() =>
      page.evaluate(() => window.__gardenProbe?.renderedConsequences.includes('grown-tree')),
    )
    .toBe(true);
  await page.getByTestId('ending-close').click();

  await interact(page, 'recap-bench');
  await expect(page.getByTestId('ending-panel')).toBeVisible();
});

test('keeps invalid save bytes during temporary recovery and resets to a new playthrough', async ({
  page,
}) => {
  await page.addInitScript((key) => localStorage.setItem(key, '{broken-save'), saveKey);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'ذخیره بازی قابل خواندن نیست' })).toBeVisible();
  await page.getByTestId('garden-start-temporary').click();
  await expect(page.getByTestId('garden-canvas')).toBeVisible();
  await expect(page.getByTestId('garden-save-now')).toBeDisabled();
  expect(await page.evaluate((key) => localStorage.getItem(key), saveKey)).toBe('{broken-save');

  await page.getByTestId('garden-new-game').click();
  await expect(page.getByTestId('reset-panel')).toBeVisible();
  await page.getByTestId('garden-cancel-reset').click();
  await expect(page.getByTestId('reset-panel')).toHaveCount(0);
  await page.getByTestId('garden-new-game').click();
  await page.getByTestId('garden-confirm-reset').click();
  await expect(page.getByTestId('scene-village')).toBeVisible();
  const resetSave = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? 'null'),
    saveKey,
  );
  expect(resetSave).toMatchObject({
    schemaVersion: 1,
    gameId: 'garden-adventure',
    mapId: 'village',
    narrative: { revision: 0, endingId: null, facts: {}, quests: {} },
  });
});

test('confirmed reset creates an independent playthrough with no old quest facts', async ({
  page,
}) => {
  await startFresh(page);
  await expect
    .poll(() =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key) ?? 'null')?.narrative.playthroughId,
        saveKey,
      ),
    )
    .toBeTruthy();
  const previousId = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? 'null')?.narrative.playthroughId as string,
    saveKey,
  );
  await interact(page, 'gardener');
  await page.getByTestId('dialogue-choice-listen-gardener').click();
  await page.getByTestId('dialogue-choice-help-gardener').click();
  await expect(page.getByTestId('quest-status')).toContainText('در جریان');

  await page.getByTestId('garden-new-game').click();
  await page.getByTestId('garden-confirm-reset').click();
  await expect(page.getByTestId('scene-village')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key) ?? 'null')?.narrative.playthroughId,
        saveKey,
      ),
    )
    .not.toBe(previousId);
  const resetSave = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? 'null'),
    saveKey,
  );
  expect(resetSave.narrative.playthroughId).not.toBe(previousId);
  expect(resetSave.narrative).toMatchObject({ revision: 0, endingId: null, facts: {}, quests: {} });
});

test('recovers an unsupported save without overwriting it until reset is confirmed', async ({
  page,
}) => {
  const unsupported = JSON.stringify({ schemaVersion: 47, future: true });
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
    key: saveKey,
    value: unsupported,
  });
  await page.goto('/');
  await expect(
    page.getByText('این ذخیره برای نسخه دیگری از بازی است', { exact: false }),
  ).toBeVisible();
  await page.getByTestId('garden-start-temporary').click();
  await expect(page.getByTestId('garden-canvas')).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), saveKey)).toBe(unsupported);
});

test('opens the cached production game while offline after installation', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('garden-offline-status')).toHaveText(
    'بازی برای باز شدن آفلاین آماده است',
  );
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);

  await page.context().setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'باغ قصه‌ها' })).toBeVisible();
  await page.getByTestId('garden-start').click();
  await expect(page.getByTestId('garden-canvas')).toBeVisible();
  await expect(page.getByTestId('scene-village')).toBeVisible();
  await page.context().setOffline(false);
});
