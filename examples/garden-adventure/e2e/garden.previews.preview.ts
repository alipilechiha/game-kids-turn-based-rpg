import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const fileNames = [
  '01-title.png',
  '02-village.png',
  '03-dialogue.png',
  '04-inventory.png',
  '05-garden-before.png',
  '06-garden-restored.png',
  '07-tactical-battle.png',
  '08-ability-effect.png',
  '09-guardian-outcome.png',
  '10-ending.png',
  '11-mobile.png',
  '12-restored.png',
] as const;
const repoRoot = resolve(process.cwd(), '../..');
const output = resolve(repoRoot, 'docs/previews/garden-adventure');
const manifestPath = resolve(output, 'provenance.json');

async function waitForScene(page: Page, mapId: 'village' | 'garden') {
  await expect(page.getByTestId(`scene-${mapId}`)).toBeVisible();
  await expect(page.getByTestId('garden-canvas')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate((expected) => {
        const probe = window.__gardenProbe;
        return (
          probe?.activeMap === expected &&
          probe.cameraKind === 'orthographic' &&
          probe.visibleMeshCount > 10 &&
          probe.frameCount > 0
        );
      }, mapId),
    )
    .toBe(true);
}

async function interact(page: Page, targetId: string) {
  const target = page.getByTestId(`target-${targetId}`);
  if ((await target.getAttribute('data-nearby')) !== 'true') {
    await target.click();
    await expect(target).toHaveAttribute('data-nearby', 'true');
  }
  await target.click();
}

async function capture(page: Page, fileName: (typeof fileNames)[number]) {
  const path = resolve(output, fileName);
  await page.screenshot({ path, fullPage: true, animations: 'disabled', caret: 'hide' });
  const bytes = readFileSync(path);
  expect(statSync(path).size, `Screenshot is unexpectedly small: ${fileName}`).toBeGreaterThan(
    5_000,
  );
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  expect(width, `Screenshot is unexpectedly narrow: ${fileName}`).toBeGreaterThan(300);
  expect(height, `Screenshot is unexpectedly short: ${fileName}`).toBeGreaterThan(300);
  return {
    file: fileName,
    width,
    height,
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

async function startGame(page: Page) {
  await page.getByTestId('garden-start').click();
  await waitForScene(page, 'village');
}

async function followGuardianPath(page: Page) {
  await interact(page, 'traveler');
  await page.getByTestId('dialogue-choice-meet-traveler').click();
  await expect(page.getByTestId('dialogue-panel')).toContainText('نشانی روی سنگ پنهان است');
  await page.getByTestId('dialogue-choice-follow-light').click();
  await interact(page, 'garden-gate');
  await waitForScene(page, 'garden');
  await interact(page, 'clue-stone');
  await interact(page, 'guardian');
  await expect(page.getByTestId('dialogue-panel')).toContainText('بازی نوری دوستانه');
  await page.getByTestId('dialogue-choice-challenge-guardian').click();
  await expect(page.getByTestId('battle-board').locator('button')).toHaveCount(25);
}

test('capture real production gameplay states and verify screenshot provenance', async ({
  page,
}) => {
  const dirtyRuntime = execFileSync(
    'git',
    [
      'status',
      '--porcelain',
      '--',
      'examples/garden-adventure/src',
      'examples/garden-adventure/public',
      'examples/garden-adventure/index.html',
      'examples/garden-adventure/vite.config.ts',
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  expect(dirtyRuntime, 'Commit sample runtime files before recording screenshot provenance').toBe(
    '',
  );
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim();
  expect(sourceCommit).toMatch(/^[0-9a-f]{40}$/);
  mkdirSync(output, { recursive: true });

  const pageErrors: string[] = [];
  const captures: Awaited<ReturnType<typeof capture>>[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'باغ قصه‌ها' })).toBeVisible();
  await expect(page.getByTestId('garden-offline-status')).toHaveText(
    'بازی برای باز شدن آفلاین آماده است',
  );
  captures.push(await capture(page, '01-title.png'));

  await startGame(page);
  captures.push(await capture(page, '02-village.png'));
  await interact(page, 'gardener');
  await expect(page.getByTestId('dialogue-panel')).toContainText('چراغ باغ خاموش شده است');
  captures.push(await capture(page, '03-dialogue.png'));
  await page.getByTestId('dialogue-choice-listen-gardener').click();
  await page.getByTestId('dialogue-choice-help-gardener').click();

  await interact(page, 'garden-gate');
  await waitForScene(page, 'garden');
  captures.push(await capture(page, '05-garden-before.png'));
  await interact(page, 'village-gate');
  await waitForScene(page, 'village');
  await interact(page, 'seed-basket');
  await expect(page.getByTestId('quest-status')).toContainText('دانه را در بستر باغ بکار');
  await interact(page, 'garden-gate');
  await waitForScene(page, 'garden');
  await interact(page, 'planting-bed');
  await expect(page.getByTestId('ending-panel')).toContainText('دانه جوانه زد');
  await page.getByTestId('ending-close').click();
  await expect
    .poll(() =>
      page.evaluate(() => window.__gardenProbe?.renderedConsequences.includes('grown-tree')),
    )
    .toBe(true);
  captures.push(await capture(page, '06-garden-restored.png'));
  await page.getByTestId('inventory-panel').locator('summary').click();
  await expect(page.getByTestId('inventory-lantern-charm')).toContainText('آویز فانوس: 1');
  await expect(page.getByTestId('toggle-lantern-charm')).toBeVisible();
  captures.push(await capture(page, '04-inventory.png'));

  await page.setViewportSize({ width: 390, height: 844 });
  await waitForScene(page, 'garden');
  captures.push(await capture(page, '11-mobile.png'));
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.reload();
  await expect(page.getByTestId('garden-continue')).toBeVisible();
  await page.getByTestId('garden-continue').click();
  await waitForScene(page, 'garden');
  await expect(page.getByTestId('ending-panel')).toContainText('دانه جوانه زد');
  await page.getByTestId('ending-close').click();
  await expect
    .poll(() =>
      page.evaluate(() => window.__gardenProbe?.renderedConsequences.includes('grown-tree')),
    )
    .toBe(true);

  await page.getByTestId('garden-new-game').click();
  await page.getByTestId('garden-confirm-reset').click();
  await waitForScene(page, 'village');
  await followGuardianPath(page);
  captures.push(await capture(page, '07-tactical-battle.png'));
  await page.getByTestId('battle-cell-2-2').click();
  await expect(page.getByTestId('battle-statuses')).toContainText('گرده رنگین');
  await page.reload();
  await expect(page.getByTestId('garden-continue')).toBeVisible();
  await page.getByTestId('garden-continue').click();
  await expect(page.getByTestId('battle-layer')).toBeVisible();
  await expect(page.getByTestId('battle-statuses')).toContainText('گرده رنگین');
  captures.push(await capture(page, '12-restored.png'));
  await page.getByTestId('battle-ability-gentle-ward').click();
  await expect(page.getByTestId('battle-statuses')).toContainText('درخشش پایدار');
  captures.push(await capture(page, '08-ability-effect.png'));
  await page.getByTestId('battle-ability-light-ray').click();
  await page.getByTestId('battle-ability-light-ray').click();
  await expect(page.getByTestId('ending-panel')).toContainText('فانوس روشن شد');
  await page.getByTestId('ending-close').click();
  await expect
    .poll(() =>
      page.evaluate(() => window.__gardenProbe?.renderedConsequences.includes('lit-lantern')),
    )
    .toBe(true);
  captures.push(await capture(page, '09-guardian-outcome.png'));
  await page.getByTestId('garden-view-recap').click();
  await expect(page.getByTestId('ending-panel')).toContainText('فانوس روشن شد');
  captures.push(await capture(page, '10-ending.png'));
  await page.getByTestId('ending-close').click();
  await page.reload();
  await expect(page.getByTestId('garden-continue')).toBeVisible();
  await page.getByTestId('garden-continue').click();
  await expect(page.getByTestId('ending-panel')).toContainText('فانوس روشن شد');
  await page.getByTestId('ending-close').click();
  await expect
    .poll(() =>
      page.evaluate(() => window.__gardenProbe?.renderedConsequences.includes('lit-lantern')),
    )
    .toBe(true);

  expect(pageErrors, 'Unhandled browser errors during Garden screenshot capture').toEqual([]);
  expect(captures.map((item) => item.file).sort()).toEqual([...fileNames].sort());

  const manifest = {
    schemaVersion: 1,
    sourceCommit,
    images: captures.sort((a, b) => a.file.localeCompare(b.file)),
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
});

test('portrait layout remains legible and controls meet the responsive viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'باغ قصه‌ها' })).toBeVisible();
  await page.getByTestId('garden-start').click();
  await waitForScene(page, 'village');
  await expect(page.locator('.target-navigation')).toBeVisible();
  await expect(page.getByTestId('target-gardener')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
});
