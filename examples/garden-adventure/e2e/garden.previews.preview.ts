import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const fileNames = [
  '01-title.png',
  '02-village.png',
  '03-npc-dialogue.png',
  '04-story-choice.png',
  '05-garden-before.png',
  '06-garden-after-help.png',
  '07-garden-after-light.png',
  '08-ending.png',
  '09-portrait.png',
  '10-restored.png',
] as const;
const saveKey = 'waypoint-rpg:garden-adventure:save';
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

async function beginGame(page: Page) {
  await page.getByTestId('garden-start').click();
  await waitForScene(page, 'village');
}

test('capture the real production Garden adventure and verify its image provenance', async ({
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

  const previous = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null;
  const pageErrors: string[] = [];
  const captures: Awaited<ReturnType<typeof capture>>[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'باغ قصه‌ها' })).toBeVisible();
  await expect(page.getByTestId('garden-offline-status')).toHaveText(
    'بازی برای باز شدن آفلاین آماده است',
  );
  captures.push(await capture(page, '01-title.png'));

  await beginGame(page);
  captures.push(await capture(page, '02-village.png'));
  await interact(page, 'gardener');
  await expect(page.getByTestId('dialogue-panel')).toContainText('چراغ باغ خاموش شده است');
  captures.push(await capture(page, '03-npc-dialogue.png'));
  await page.getByTestId('dialogue-choice-listen-gardener').click();
  await expect(page.getByTestId('dialogue-panel')).toContainText('یک دانه ویژه دارم');
  captures.push(await capture(page, '04-story-choice.png'));
  await page.getByTestId('dialogue-choice-help-gardener').click();

  await interact(page, 'garden-gate');
  await waitForScene(page, 'garden');
  await expect(page.getByTestId('quest-status')).toContainText('سبد دانه‌ها را در روستا پیدا کن');
  captures.push(await capture(page, '05-garden-before.png'));

  await interact(page, 'village-gate');
  await waitForScene(page, 'village');
  await interact(page, 'seed-basket');
  await interact(page, 'garden-gate');
  await waitForScene(page, 'garden');
  await interact(page, 'planting-bed');
  await expect(page.getByTestId('ending-panel')).toContainText('دانه جوانه زد');
  captures.push(await capture(page, '08-ending.png'));
  await page.getByTestId('ending-close').click();
  await expect
    .poll(() =>
      page.evaluate(() => window.__gardenProbe?.renderedConsequences.includes('grown-tree')),
    )
    .toBe(true);
  captures.push(await capture(page, '06-garden-after-help.png'));

  await page.setViewportSize({ width: 430, height: 860 });
  await waitForScene(page, 'garden');
  captures.push(await capture(page, '09-portrait.png'));
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
  captures.push(await capture(page, '10-restored.png'));

  await page.evaluate((key) => localStorage.removeItem(key), saveKey);
  await page.reload();
  await expect(page.getByTestId('garden-start')).toBeVisible();
  await beginGame(page);
  await interact(page, 'traveler');
  await page.getByTestId('dialogue-choice-meet-traveler').click();
  await expect(page.getByTestId('dialogue-panel')).toContainText('نشانی روی سنگ پنهان است');
  await page.getByTestId('dialogue-choice-follow-light').click();
  await interact(page, 'garden-gate');
  await waitForScene(page, 'garden');
  await interact(page, 'clue-stone');
  await interact(page, 'ancient-lantern');
  await expect(page.getByTestId('ending-panel')).toContainText('فانوس روشن شد');
  await page.getByTestId('ending-close').click();
  await expect
    .poll(() =>
      page.evaluate(() => window.__gardenProbe?.renderedConsequences.includes('lit-lantern')),
    )
    .toBe(true);
  captures.push(await capture(page, '07-garden-after-light.png'));

  expect(pageErrors, 'Unhandled browser errors during Garden screenshot capture').toEqual([]);
  expect(captures.map((item) => item.file).sort()).toEqual([...fileNames].sort());

  const previousHashes = new Map(
    (previous?.images ?? []).map((image: { file: string; sha256: string }) => [
      image.file,
      image.sha256,
    ]),
  );
  const imagesChanged = captures.some((item) => previousHashes.get(item.file) !== item.sha256);
  const manifest = {
    schemaVersion: 1,
    sourceCommit:
      imagesChanged || previous?.sourceCommit === undefined ? sourceCommit : previous.sourceCommit,
    images: captures.sort((a, b) => a.file.localeCompare(b.file)),
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
});

function existsSync(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}
