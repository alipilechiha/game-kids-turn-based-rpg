import { mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { enableWorldProbe, openQuestDialogue } from './npcTap.ts';
import { setTier } from '../scripts/drive-world.ts';

/**
 * Screenshot-only scenario for the real, production-built محله مهربانی game.
 * Not part of the four ordinary E2E shards. Captures are reviewed before
 * documentation promotion; they are never used as exact pixel assertions.
 */
const output = 'docs/previews/legacy-sample';
type SnapshotFilename =
  | '01-title.png'
  | '02-avatar-select.png'
  | '03-headwear-select.png'
  | '04-town-hub.png'
  | '05-town-portrait.png'
  | '06-guardian-dialogue.png'
  | '07-encounter-choice.png';

async function capture(page: Page, filename: SnapshotFilename) {
  mkdirSync(output, { recursive: true });
  const path = join(output, filename);
  await page.screenshot({ path, fullPage: true, animations: 'disabled', caret: 'hide' });
  expect(statSync(path).size, `Unexpectedly small screenshot: ${filename}`).toBeGreaterThan(5_000);
}

test.setTimeout(240_000);

test('capture genuine library-backed Kids RPG preview states', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await enableWorldProbe(page);
  await page.goto('/?research=0');
  await expect(page.getByTestId('start-button')).toBeVisible();
  await capture(page, '01-title.png');

  await page.getByTestId('start-button').click();
  await expect(page.getByTestId('avatar-aban')).toBeVisible();
  await capture(page, '02-avatar-select.png');

  await page.getByTestId('avatar-aban').click();
  await expect(page.getByTestId('headwear-next')).toBeVisible();
  await capture(page, '03-headwear-select.png');

  await page.getByTestId('headwear-next').click();
  await expect(page.getByTestId('hud')).toBeVisible();
  await expect(page.getByTestId('world-canvas')).toBeVisible();
  await expect(page.getByTestId('world-canvas').locator('canvas')).toBeVisible();

  // Choose a deterministic visible quality tier through the real parent UI.
  await setTier(page, 'normal');
  await page.waitForTimeout(600);
  await capture(page, '04-town-hub.png');

  await page.setViewportSize({ width: 360, height: 800 });
  await expect(page.getByTestId('hud')).toBeVisible();
  await page.waitForTimeout(450);
  await capture(page, '05-town-portrait.png');

  await page.setViewportSize({ width: 880, height: 420 });
  await openQuestDialogue(page, 'quest-greeting');
  await expect(page.getByTestId('npc-dialogue')).toBeVisible();
  await capture(page, '06-guardian-dialogue.png');

  await page.getByTestId('start-quest').click();
  await expect(page.getByTestId('encounter-choice')).toBeVisible({ timeout: 30_000 });
  await capture(page, '07-encounter-choice.png');

  expect(pageErrors, 'Unhandled browser errors during preview capture').toEqual([]);
});
