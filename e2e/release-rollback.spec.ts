import { cpSync, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { playQuest, resumeFromPicker, startGame, expandTrail } from './harness.ts';

const root = process.cwd();
const compatibilityRoot = resolve(root, '.release-compat');
const currentDist = resolve(root, 'dist');
const oldDist = join(compatibilityRoot, 'old-source', 'dist');
const candidateDist = join(compatibilityRoot, 'candidate-dist');

async function waitForSavedQuest(page: Page, questId: string) {
  await expect
    .poll(() =>
      page.evaluate(async (targetQuestId) => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('mahalle-ye-mehrabani');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const tx = db.transaction('progress', 'readonly');
        const store = tx.objectStore('progress');
        const profiles = await new Promise<Array<{ id: string }>>((resolve, reject) => {
          const request = store.get('profiles');
          request.onsuccess = () => resolve(request.result ?? []);
          request.onerror = () => reject(request.error);
        });
        const profile = profiles[0];
        if (!profile) return false;
        const state = await new Promise<
          { quests?: Record<string, { status?: string }> } | undefined
        >((resolve, reject) => {
          const request = store.get(`profile:${profile.id}`);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        return state?.quests?.[targetQuestId]?.status === 'completed';
      }, questId),
    )
    .toBe(true);
}

async function waitForWaitingWorker(page: Page) {
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    await registration.update();
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(
        () => reject(new Error('service worker update timed out')),
        90_000,
      );
      const check = () => {
        if (!registration.waiting) return;
        window.clearTimeout(timeout);
        resolve();
      };
      registration.addEventListener('updatefound', () => {
        registration.installing?.addEventListener('statechange', check);
        check();
      });
      check();
    });
  });
}

async function applyWaitingWorker(page: Page) {
  await page.getByTestId('pause-button').click();
  const apply = page.getByTestId('apply-update');
  await expect(apply).toBeVisible({ timeout: 30_000 });
  const navigation = page.waitForNavigation({ waitUntil: 'domcontentloaded' });
  await apply.click();
  await navigation;
}

function replaceServedBuild(source: string) {
  if (!existsSync(join(source, 'index.html')))
    throw new Error(`Release fixture is missing index.html: ${source}`);
  rmSync(currentDist, { recursive: true, force: true });
  cpSync(source, currentDist, { recursive: true, errorOnExist: true });
}

test('same-origin upgrade and rollback retain the newest save @release-rollback', async ({
  page,
  context,
}) => {
  test.skip(
    process.env['RUN_RELEASE_ROLLBACK'] !== '1',
    'run in the focused release-compatibility step',
  );
  test.skip(
    !existsSync(join(compatibilityRoot, 'manifest.json')),
    'run npm run release:rollback:prepare before this focused test',
  );
  test.setTimeout(300_000);

  try {
    // The archived baseline represents the old deployment; it shares the
    // browser origin and IndexedDB with the candidate built by this branch.
    replaceServedBuild(oldDist);
    await startGame(page);
    await playQuest(page, 'quest-greeting');
    await waitForSavedQuest(page, 'quest-greeting');
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await page.reload();
    await resumeFromPicker(page);

    // Install and explicitly apply the candidate worker through the same
    // parent-area control a family sees in production.
    replaceServedBuild(candidateDist);
    await waitForWaitingWorker(page);
    await applyWaitingWorker(page);
    await resumeFromPicker(page);
    await expandTrail(page);
    await expect(page.getByTestId('trail-quest-greeting')).toContainText('انجام شد');

    // The candidate must resume entirely offline, then commit newer progress.
    await context.setOffline(true);
    await page.reload();
    await resumeFromPicker(page);
    await playQuest(page, 'quest-helping');
    await waitForSavedQuest(page, 'quest-helping');
    const saveCompatibility = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('mahalle-ye-mehrabani');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const transaction = db.transaction('progress', 'readonly');
      const profiles = await new Promise<Array<{ id: string }>>((resolve, reject) => {
        const request = transaction.objectStore('progress').get('profiles');
        request.onsuccess = () => resolve(request.result ?? []);
        request.onerror = () => reject(request.error);
      });
      const request = transaction.objectStore('progress').get(`profile:${profiles[0]?.id}`);
      return new Promise<{ databaseVersion: number; schemaVersion?: number }>((resolve, reject) => {
        request.onsuccess = () =>
          resolve({ databaseVersion: db.version, schemaVersion: request.result?.schemaVersion });
        request.onerror = () => reject(request.error);
      });
    });
    expect(saveCompatibility).toEqual({ databaseVersion: 2, schemaVersion: 3 });
    await context.setOffline(false);

    // Serve the old app again on the same origin. Its worker update can only
    // replace cached code; it must not roll back or clear IndexedDB progress.
    replaceServedBuild(oldDist);
    await waitForWaitingWorker(page);
    await applyWaitingWorker(page);
    await resumeFromPicker(page);
    await expandTrail(page);
    await expect(page.getByTestId('trail-quest-greeting')).toContainText('انجام شد');
    await expect(page.getByTestId('trail-quest-helping')).toContainText('انجام شد');
    await expect(page.getByTestId('quest-celebration')).toHaveCount(0);
    await waitForSavedQuest(page, 'quest-helping');
  } finally {
    await context.setOffline(false).catch(() => {});
    replaceServedBuild(candidateDist);
  }
});
