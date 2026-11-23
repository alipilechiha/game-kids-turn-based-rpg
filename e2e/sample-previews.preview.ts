import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { enableWorldProbe, openQuestDialogue } from './npcTap.ts';
import { setTier, waitForCameraSettle } from '../scripts/drive-world.ts';

/**
 * Screenshot-only scenario for the real, production-built محله مهربانی game.
 * Not part of the four ordinary E2E shards. Captures are reviewed before
 * documentation promotion; they are never used as exact pixel assertions.
 */
const output = 'docs/previews/legacy-sample';
const manifestPath = join(output, 'provenance.json');
const snapshots = [
  '01-title.png',
  '02-avatar-select.png',
  '03-headwear-select.png',
  '04-town-hub.png',
  '05-town-portrait.png',
  '06-guardian-dialogue.png',
  '07-encounter-choice.png',
] as const;

async function capture(page: Page, filename: (typeof snapshots)[number]) {
  mkdirSync(output, { recursive: true });
  const path = join(output, filename);
  await page.screenshot({ path, fullPage: true, animations: 'disabled', caret: 'hide' });
  const bytes = readFileSync(path);
  expect(statSync(path).size, `Unexpectedly small screenshot: ${filename}`).toBeGreaterThan(5_000);
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(bytes.readUInt32BE(16)).toBeGreaterThan(300);
  expect(bytes.readUInt32BE(20)).toBeGreaterThan(300);
  return {
    file: filename,
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

test.setTimeout(240_000);

test('capture genuine library-backed Kids RPG preview states', async ({ page }) => {
  const dirtySource = execFileSync(
    'git',
    ['status', '--porcelain', '--', 'src', 'public', 'index.html', 'vite.config.ts'],
    { encoding: 'utf8' },
  );
  expect(dirtySource, 'Commit Kids RPG runtime files before recording screenshot provenance').toBe(
    '',
  );
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  expect(sourceCommit).toMatch(/^[0-9a-f]{40}$/);
  const previous = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null;
  const captures: Awaited<ReturnType<typeof capture>>[] = [];
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await enableWorldProbe(page);
  await page.goto('/?research=0');
  await expect(page.getByTestId('start-button')).toBeVisible();
  captures.push(await capture(page, '01-title.png'));

  await page.getByTestId('start-button').click();
  await expect(page.getByTestId('avatar-aban')).toBeVisible();
  captures.push(await capture(page, '02-avatar-select.png'));

  await page.getByTestId('avatar-aban').click();
  await expect(page.getByTestId('headwear-next')).toBeVisible();
  captures.push(await capture(page, '03-headwear-select.png'));

  await page.getByTestId('headwear-next').click();
  await expect(page.getByTestId('hud')).toBeVisible();
  await expect(page.getByTestId('world-canvas')).toBeVisible();
  await expect(page.getByTestId('world-canvas').locator('canvas')).toBeVisible();

  // Choose a deterministic visible quality tier through the real parent UI.
  await setTier(page, 'normal');
  await waitForCameraSettle(page);
  captures.push(await capture(page, '04-town-hub.png'));

  await page.setViewportSize({ width: 360, height: 800 });
  await expect(page.getByTestId('hud')).toBeVisible();
  await waitForCameraSettle(page);
  captures.push(await capture(page, '05-town-portrait.png'));

  await page.setViewportSize({ width: 880, height: 420 });
  await openQuestDialogue(page, 'quest-greeting');
  await expect(page.getByTestId('npc-dialogue')).toBeVisible();
  captures.push(await capture(page, '06-guardian-dialogue.png'));

  await page.getByTestId('start-quest').click();
  await expect(page.getByTestId('encounter-choice')).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __worldAnimationStats?: { active: number } })
            .__worldAnimationStats?.active ?? 0,
      ),
    )
    .toBe(0);
  captures.push(await capture(page, '07-encounter-choice.png'));

  expect(pageErrors, 'Unhandled browser errors during preview capture').toEqual([]);
  expect(captures.map((image) => image.file).sort()).toEqual([...snapshots].sort());
  const oldHashes = new Map(
    (previous?.images ?? []).map((image: { file: string; sha256: string }) => [
      image.file,
      image.sha256,
    ]),
  );
  const imagesChanged = captures.some((image) => oldHashes.get(image.file) !== image.sha256);
  const manifest = {
    schemaVersion: 1,
    sourceCommit:
      imagesChanged || previous?.sourceCommit === undefined ? sourceCommit : previous.sourceCommit,
    images: captures.sort((a, b) => a.file.localeCompare(b.file)),
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
});

function existsSync(path: string) {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}
