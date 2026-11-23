import assert from 'node:assert/strict';
import { log } from 'node:console';
import { chromium } from '@playwright/test';
import { preview } from 'vite';

/* global Storage, URL, document, getComputedStyle, localStorage, window */

const server = await preview({
  preview: { host: '127.0.0.1', port: 0, strictPort: false },
});
let browser;

async function hasFocus(locator) {
  return locator.evaluate((element) => element === document.activeElement);
}

try {
  const address = server.httpServer.address();
  assert.ok(address && typeof address === 'object', 'Vite preview must use an ephemeral port');

  browser = await chromium.launch({
    headless: true,
    args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: 'networkidle' });

  const map = page.getByTestId('active-map');
  const camera = page.getByTestId('camera-kind');
  const canvas = page.getByTestId('scene-canvas');
  await page.waitForFunction(
    () =>
      window.__sceneProbe?.cameraKind === 'perspective' &&
      document.querySelector('[data-testid="session-readiness"]')?.textContent === 'ready',
  );
  assert.equal(await map.textContent(), 'map-courtyard');
  assert.equal(await camera.textContent(), 'perspective');
  assert.equal(await page.getByTestId('scene-transition').isDisabled(), true);
  const baselineRuntimeSubscriptions = await page.evaluate(
    () => window.__sceneProbe?.runtimeSubscriptions,
  );
  assert.ok(
    Number.isInteger(baselineRuntimeSubscriptions) && baselineRuntimeSubscriptions >= 1,
    'the runtime subscription probe must initialize',
  );
  await canvas.evaluate((element) => {
    window.__originalSceneCanvas = element;
  });

  await page.waitForTimeout(750);
  const settledFrameCount = await page.evaluate(() => window.__sceneProbe?.frameCount);
  await page.waitForTimeout(750);
  assert.equal(
    await page.evaluate(() => window.__sceneProbe?.frameCount),
    settledFrameCount,
    'demand rendering must settle while the scene is idle',
  );

  const dialog = page.getByTestId('narrative-dialog');
  const openDialogue = page.getByTestId('dialogue-open');
  await openDialogue.click();
  await dialog.waitFor({ state: 'visible' });
  assert.equal(await dialog.getAttribute('aria-modal'), 'true');
  assert.equal(await dialog.getAttribute('dir'), 'rtl');
  assert.equal(await dialog.getAttribute('lang'), 'fa');
  assert.equal(await dialog.getAttribute('aria-labelledby'), 'narrative-speaker');
  assert.equal(await hasFocus(page.getByTestId('dialogue-choice-seek-truth')), true);
  const choiceOrder = await page.locator('.narrative-dialog__choices button').allTextContents();
  assert.deepEqual(choiceOrder, ['حقیقت را می‌جویم', 'پاسخ تند می‌خواهم']);
  assert.equal(
    await page.locator('#narrative-text').textContent(),
    'نگهبان به برگ نگاه کرد. چه می‌جویی؟',
  );
  const choiceLayout = await page
    .locator('.narrative-dialog__choices button')
    .evaluateAll((buttons) =>
      buttons.map((button) => {
        const style = getComputedStyle(button);
        return {
          top: button.getBoundingClientRect().top,
          direction: style.direction,
          textAlign: style.textAlign,
        };
      }),
    );
  assert.ok(
    choiceLayout[0].top < choiceLayout[1].top,
    'Persian choices remain in authored top-to-bottom order',
  );
  assert.ok(choiceLayout.every((item) => item.direction === 'rtl' && item.textAlign === 'right'));

  await page.keyboard.press('Tab');
  assert.equal(await hasFocus(page.getByTestId('dialogue-choice-seek-vengeance')), true);
  await page.keyboard.press('Shift+Tab');
  assert.equal(await hasFocus(page.getByTestId('dialogue-choice-seek-truth')), true);
  await page.keyboard.press('Tab');
  assert.equal(await hasFocus(page.getByTestId('dialogue-choice-seek-vengeance')), true);
  await page.keyboard.press('Tab');
  assert.equal(await hasFocus(page.getByTestId('dialogue-leave')), true);
  await page.evaluate(() => {
    const main = document.querySelector('main');
    window.__backgroundClicks = 0;
    main?.addEventListener('click', () => (window.__backgroundClicks += 1));
  });
  const stageBox = await page.locator('.scene-stage').boundingBox();
  assert.ok(stageBox, 'the scene background must be visible behind the modal');
  await page.mouse.click(stageBox.x + 8, stageBox.y + 8);
  assert.equal(
    await page.evaluate(() => window.__backgroundClicks),
    0,
    'a pointer click outside the modal cannot reach the background application',
  );
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="narrative-dialog"]')?.open,
  );
  assert.equal(await hasFocus(openDialogue), true, 'Escape restores focus to the dialogue opener');
  assert.equal(await page.getByTestId('scene-transition').isDisabled(), true);

  await openDialogue.click();
  await page.getByTestId('dialogue-choice-seek-truth').click();
  await page.getByTestId('dialogue-close').waitFor({ state: 'visible' });
  assert.match(await page.locator('#narrative-text').textContent(), /کارگاه/);
  await page.getByTestId('dialogue-leave').click();
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="narrative-dialog"]')?.open,
  );
  assert.equal(await page.getByTestId('scene-transition').isEnabled(), true);
  await page.getByTestId('scene-transition').click();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="active-map"]')?.textContent === 'map-workshop' &&
      window.__sceneProbe?.cameraIsOrthographic === true &&
      window.__sceneProbe?.lampLit === false,
  );
  assert.equal(
    await canvas.evaluate(
      (element) => element.isConnected && element === window.__originalSceneCanvas,
    ),
    true,
    'a map transition must preserve the mounted canvas element',
  );
  assert.ok(
    await page.evaluate(() => window.__sceneProbe?.disposedScenes),
    'the departed scene resource must be disposed',
  );
  assert.match(
    await page.getByTestId('suspended-dialogue-guidance').textContent(),
    /حیاط/,
    'a suspended courtyard conversation names its owning scene',
  );
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="session-readiness"]')?.textContent === 'ready' &&
      document.querySelector('[data-testid="active-map"]')?.textContent === 'map-workshop' &&
      document
        .querySelector('[data-testid="suspended-dialogue-guidance"]')
        ?.textContent.includes('حیاط'),
  );
  assert.equal(await camera.textContent(), 'orthographic');
  assert.equal(await page.getByTestId('clue-interaction').count(), 0);
  await page.getByTestId('scene-transition').click();
  await page.waitForFunction(
    () => document.querySelector('[data-testid="active-map"]')?.textContent === 'map-courtyard',
  );
  await openDialogue.click();
  await page.getByTestId('dialogue-close').waitFor({ state: 'visible' });
  await page.getByTestId('dialogue-close').click();
  await page.getByTestId('scene-transition').click();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="active-map"]')?.textContent === 'map-workshop' &&
      document.querySelector('[data-testid="clue-interaction"]') !== null,
  );
  await page.getByTestId('clue-interaction').click();
  await page.getByTestId('dialogue-advance').click();
  await page.getByTestId('dialogue-leave').click();
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="narrative-dialog"]')?.open,
  );
  await page.getByTestId('scene-transition').click();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="active-map"]')?.textContent === 'map-courtyard' &&
      document
        .querySelector('[data-testid="suspended-dialogue-guidance"]')
        ?.textContent.includes('کارگاه'),
  );
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="session-readiness"]')?.textContent === 'ready' &&
      document.querySelector('[data-testid="active-map"]')?.textContent === 'map-courtyard' &&
      document
        .querySelector('[data-testid="suspended-dialogue-guidance"]')
        ?.textContent.includes('کارگاه'),
  );
  await page.getByTestId('scene-transition').click();
  await page.waitForFunction(
    () => document.querySelector('[data-testid="active-map"]')?.textContent === 'map-workshop',
  );
  await page.getByTestId('clue-interaction').click();
  await page.getByTestId('dialogue-choice-investigate-clue').waitFor({ state: 'visible' });
  assert.equal(await hasFocus(page.getByTestId('dialogue-choice-investigate-clue')), true);
  await page.getByTestId('dialogue-choice-investigate-clue').click();
  await page.getByTestId('dialogue-close').click();
  assert.equal(await page.getByTestId('quest-status').getAttribute('data-status'), 'completed');
  assert.equal(await page.getByTestId('clue-status').getAttribute('data-resolved'), 'true');
  await page.waitForFunction(() => window.__sceneProbe?.lampLit === true);
  const workshopSubscriptions = await page.evaluate(
    () => window.__sceneProbe?.runtimeSubscriptions,
  );
  await page.getByTestId('scene-transition').click();
  await page.waitForFunction(
    (subscriptionCount) =>
      document.querySelector('[data-testid="active-map"]')?.textContent === 'map-courtyard' &&
      window.__sceneProbe?.runtimeSubscriptions === subscriptionCount,
    workshopSubscriptions,
  );

  await openDialogue.click();
  assert.match(await page.locator('#narrative-text').textContent(), /سرنخ/);
  await page.getByTestId('dialogue-choice-end-with-truth').waitFor({ state: 'visible' });
  assert.equal(await page.getByTestId('dialogue-choice-end-with-truth').isEnabled(), true);
  await page.getByTestId('dialogue-choice-end-with-truth').click();
  await page.getByTestId('dialogue-finish').waitFor({ state: 'visible' });
  assert.match(await page.locator('#narrative-text').textContent(), /چراغ روشن/);
  await page.getByTestId('dialogue-finish').click();
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="narrative-dialog"]')?.open,
  );
  assert.equal(await page.getByTestId('story-ending').textContent(), 'پایان روشنایی');
  assert.equal(await page.getByTestId('quest-status').getAttribute('data-status'), 'completed');
  assert.equal(
    await page.evaluate(() => document.activeElement?.tagName.toLowerCase()),
    'main',
    'finishing after reload-safe focus fallback returns focus to the main landmark',
  );

  await page.getByTestId('scene-transition').click();
  await page.waitForFunction(
    (subscriptionCount) =>
      document.querySelector('[data-testid="active-map"]')?.textContent === 'map-workshop' &&
      window.__sceneProbe?.runtimeSubscriptions === subscriptionCount &&
      window.__sceneProbe?.lampLit === true,
    workshopSubscriptions,
  );
  await page.evaluate(() => {
    const context = document.querySelector('[data-testid="scene-canvas"]')?.getContext('webgl2');
    const loseContext = context?.getExtension('WEBGL_lose_context');
    if (!loseContext) throw new Error('WEBGL_lose_context is unavailable in Chromium');
    loseContext.loseContext();
  });
  await page.getByTestId('restore-context').waitFor({ state: 'visible' });
  await page.getByTestId('restore-context').click();
  try {
    await page.waitForFunction(
      () =>
        document.querySelectorAll('[data-testid="scene-canvas"]').length === 1 &&
        window.__sceneProbe?.cameraIsOrthographic === true &&
        window.__sceneProbe?.lampLit === true,
      null,
      { timeout: 12_000 },
    );
  } catch (error) {
    const state = await page.evaluate(() => ({
      map: document.querySelector('[data-testid="active-map"]')?.textContent,
      camera: document.querySelector('[data-testid="camera-kind"]')?.textContent,
      canvasCount: document.querySelectorAll('[data-testid="scene-canvas"]').length,
      restoreVisible: Boolean(document.querySelector('[data-testid="restore-context"]')),
      probe: window.__sceneProbe,
    }));
    throw new Error(`Context recovery did not settle: ${JSON.stringify(state)}`, { cause: error });
  }
  const recoveredSubscriptions = await page.evaluate(
    () => window.__sceneProbe?.runtimeSubscriptions,
  );
  assert.ok(
    Number.isInteger(recoveredSubscriptions) && recoveredSubscriptions >= 1,
    'the runtime subscription probe remains available after context recovery',
  );
  assert.deepEqual(pageErrors, []);

  // The second branch reaches a different authored ending and cannot light the conditional lamp.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="session-readiness"]')?.textContent === 'ready' &&
      document.querySelector('[data-testid="active-map"]')?.textContent === 'map-workshop',
  );
  assert.equal(await page.getByTestId('entry-anchor').textContent(), 'anchor-workshop-door');
  assert.equal(await page.getByTestId('story-ending').textContent(), 'پایان روشنایی');
  assert.equal(await page.evaluate(() => window.__sceneProbe?.lampLit), true);
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByTestId('story-reset').click();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="session-readiness"]')?.textContent === 'ready' &&
      document.querySelector('[data-testid="active-map"]')?.textContent === 'map-courtyard' &&
      document.querySelector('[data-testid="story-ending"]')?.textContent === '',
  );
  await page.getByTestId('dialogue-open').click();
  await page.getByTestId('dialogue-choice-seek-vengeance').click();
  await page.getByTestId('dialogue-advance').click();
  await page.getByTestId('dialogue-choice-end-with-anger').click();
  await page.getByTestId('dialogue-finish').click();
  await page.waitForFunction(() => document.activeElement?.tagName.toLowerCase() === 'main');
  assert.equal(
    await hasFocus(page.locator('main')),
    true,
    'closing after reload restores focus to the main landmark when the opener is disabled',
  );
  assert.equal(await page.getByTestId('story-ending').textContent(), 'پایان خشم');
  assert.equal(await page.getByTestId('quest-status').getAttribute('data-status'), 'failed');
  await page.getByTestId('scene-transition').click();
  await page.waitForFunction(
    () => document.querySelector('[data-testid="active-map"]')?.textContent === 'map-workshop',
  );
  assert.equal(await page.getByTestId('clue-interaction').count(), 0);
  assert.equal(await page.evaluate(() => window.__sceneProbe?.lampLit), false);
  assert.deepEqual(pageErrors, []);

  const corruptSave = '{preserve-this-corrupt-save';
  await page.evaluate(
    (value) => localStorage.setItem('waypoint-rpg-scene-demo:save', value),
    corruptSave,
  );
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByTestId('save-recovery').waitFor({ state: 'visible' });
  assert.equal(await page.getByTestId('session-readiness').textContent(), 'recovery-required');
  assert.equal(
    await page.evaluate(() => localStorage.getItem('waypoint-rpg-scene-demo:save')),
    corruptSave,
  );
  await page.getByTestId('recover-session').click();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="session-readiness"]')?.textContent === 'ready' &&
      document.querySelector('[data-testid="active-map"]')?.textContent === 'map-courtyard' &&
      document.querySelector('[data-testid="save-mode"]')?.textContent === 'session-only',
  );
  await page.getByTestId('save-warning').waitFor({ state: 'visible' });
  await page.evaluate(() => {
    const originalRemove = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function (key) {
      if (key === 'waypoint-rpg-scene-demo:save') return;
      originalRemove.call(this, key);
    };
  });
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByTestId('story-reset').click();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="session-readiness"]')?.textContent === 'ready' &&
      document.querySelector('[data-testid="save-mode"]')?.textContent === 'session-only',
  );
  await page.getByTestId('save-warning').waitFor({ state: 'visible' });
  assert.equal(
    await page.evaluate(() => localStorage.getItem('waypoint-rpg-scene-demo:save')),
    corruptSave,
    'a reset that cannot clear storage must preserve the old bytes',
  );
  await page.getByTestId('dialogue-open').click();
  await page.getByTestId('narrative-dialog').waitFor({ state: 'visible' });
  assert.equal(
    await page.evaluate(() => localStorage.getItem('waypoint-rpg-scene-demo:save')),
    corruptSave,
    'session-only recovery must leave the original malformed bytes untouched',
  );
  assert.deepEqual(pageErrors, []);

  const externalAssetRequests = [];
  await page.route('**/*', async (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.origin !== `http://127.0.0.1:${address.port}`) {
      externalAssetRequests.push(requestUrl.href);
      await route.abort();
      return;
    }
    await route.continue();
  });
  let staticAssetRequests = 0;
  let releaseSlowAsset;
  let notifySlowAssetStarted;
  const slowAssetStarted = new Promise((resolve) => {
    notifySlowAssetStarted = resolve;
  });
  await page.route('**/models/phase5-textured-static.glb', async (route) => {
    staticAssetRequests += 1;
    if (staticAssetRequests === 2) {
      notifySlowAssetStarted?.();
      await new Promise((resolve) => {
        releaseSlowAsset = resolve;
      });
      try {
        await route.continue();
      } catch {
        // The component cancels this request when its selected asset changes.
      }
      return;
    }
    if (staticAssetRequests === 3) {
      await route.fulfill({ status: 503, body: 'fixture load failure' });
      return;
    }
    await route.continue();
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`http://127.0.0.1:${address.port}/?phase5=assets&phase5-test=1`, {
    waitUntil: 'networkidle',
  });
  await page.waitForTimeout(1500);
  const modelReadiness = await page.evaluate(() =>
    Object.fromEntries(
      ['static', 'traveler', 'guardian'].map((id) => {
        const element = document.querySelector(`[data-testid="model-status-${id}"]`);
        return [id, { status: element?.getAttribute('data-status'), text: element?.textContent }];
      }),
    ),
  );
  assert.deepEqual(
    Object.values(modelReadiness).map((entry) => entry.status),
    ['ready', 'ready', 'ready'],
    `model load state: ${JSON.stringify(modelReadiness)}`,
  );
  assert.equal(await page.getByTestId('phase5-model-canvas').count(), 1);
  assert.equal(await page.getByTestId('model-status-static').getAttribute('data-meshes'), '1');
  assert.equal(
    await page.getByTestId('model-status-static').getAttribute('data-skinned-meshes'),
    '0',
  );
  assert.equal(await page.getByTestId('model-status-rigged').getAttribute('data-meshes'), '1');
  assert.equal(
    await page.getByTestId('model-status-rigged').getAttribute('data-skinned-meshes'),
    '1',
  );
  assert.deepEqual(
    (await page.getByTestId('model-status-rigged').getAttribute('data-clips'))?.split(','),
    ['idle', 'move', 'interact', 'combat'],
  );
  assert.equal(
    await page.getByTestId('model-status-traveler').getAttribute('data-skinned-meshes'),
    '1',
  );
  assert.equal(
    await page.getByTestId('model-status-guardian').getAttribute('data-skinned-meshes'),
    '1',
  );
  await page.getByTestId('model-asset-select').selectOption('phase5-khronos-box');
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="model-status-static"]')?.getAttribute('data-status') ===
      'ready',
  );
  assert.equal(await page.getByTestId('model-status-static').getAttribute('data-meshes'), '1');
  await page.getByTestId('model-asset-select').selectOption('phase5-khronos-rigged-figure');
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="model-status-static"]')
        ?.getAttribute('data-skinned-meshes') === '1',
  );
  assert.deepEqual(
    (await page.getByTestId('model-status-static').getAttribute('data-clips'))?.split(','),
    ['clip-1'],
  );
  await page.getByTestId('rigged-asset-select').selectOption('phase5-khronos-rigged-figure');
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="model-status-traveler"]')
        ?.getAttribute('data-status') === 'ready' &&
      document
        .querySelector('[data-testid="model-status-guardian"]')
        ?.getAttribute('data-status') === 'ready',
  );
  assert.deepEqual(
    (await page.getByTestId('model-status-traveler').getAttribute('data-clips'))?.split(','),
    ['clip-1'],
  );
  const externalSkeletonsAreIndependent = await page.evaluate(() => {
    const skeletonByInstance = new Map();
    window.__phase5ModelProbe?.scene.traverse((object) => {
      if (!object.isSkinnedMesh) return;
      let root = object;
      while (root.parent && !root.userData.phase5InstanceId) root = root.parent;
      if (root.userData.phase5InstanceId)
        skeletonByInstance.set(root.userData.phase5InstanceId, object.skeleton);
    });
    return (
      skeletonByInstance.has('traveler') &&
      skeletonByInstance.has('guardian') &&
      skeletonByInstance.get('traveler') !== skeletonByInstance.get('guardian')
    );
  });
  assert.equal(
    externalSkeletonsAreIndependent,
    true,
    'external rigged clones must own separate skeletons',
  );
  await page.getByTestId('model-asset-select').selectOption('phase5-textured-static');
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="model-status-static"]')
        ?.getAttribute('data-skinned-meshes') === '0',
  );
  await page.getByTestId('rigged-asset-select').selectOption('phase5-animated-guardian');
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="model-status-traveler"]')
        ?.getAttribute('data-status') === 'ready' &&
      document
        .querySelector('[data-testid="model-status-guardian"]')
        ?.getAttribute('data-status') === 'ready',
  );
  assert.equal(
    await page.getByTestId('reduced-motion-state').getAttribute('data-reduced-motion'),
    'true',
  );
  await page.getByTestId('model-asset-select').selectOption('phase5-slow-static');
  await slowAssetStarted;
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="model-status-static"]')?.getAttribute('data-status') ===
      'loading',
  );
  const rootsWhileAssetLoadIsPending = await page.evaluate(() => {
    let count = 0;
    window.__phase5ModelProbe?.scene.traverse((object) => {
      if (object.userData.phase5InstanceId === 'static-preview') count += 1;
    });
    return count;
  });
  assert.equal(
    rootsWhileAssetLoadIsPending,
    0,
    'a changed asset ID must remove the old root before the new asset finishes loading',
  );
  await page.getByTestId('model-asset-select').selectOption('phase5-textured-static');
  releaseSlowAsset?.();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="model-status-static"]')?.getAttribute('data-status') ===
      'ready',
  );
  await page.getByTestId('model-asset-select').selectOption('phase5-error-static');
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="model-status-static"]')?.getAttribute('data-status') ===
      'error',
  );
  await page.getByTestId('model-asset-select').selectOption('phase5-textured-static');
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="model-status-static"]')?.getAttribute('data-status') ===
      'ready',
  );
  await page.getByTestId('model-asset-select').selectOption('phase5-error-static');
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="model-status-static"]')?.getAttribute('data-status') ===
      'ready',
  );
  await page.getByTestId('model-asset-select').selectOption('phase5-textured-static');
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="model-status-static"]')?.getAttribute('data-status') ===
      'ready',
  );
  const initialRevision = await page.getByTestId('gameplay-revision').textContent();
  await page.getByTestId('gameplay-move').click();
  await page.waitForFunction(() =>
    document
      .querySelector('[data-testid="gameplay-feedback"]')
      ?.textContent?.startsWith('Accepted movement'),
  );
  assert.notEqual(await page.getByTestId('gameplay-revision').textContent(), initialRevision);
  assert.match(
    (await page.getByTestId('gameplay-traveler-position').textContent()) ?? '',
    /cell 1,0/,
  );
  assert.match(
    (await page.getByTestId('gameplay-guardian-position').textContent()) ?? '',
    /cell 5,0/,
  );
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="animation-action-traveler"]')
        ?.textContent?.includes('move') &&
      document
        .querySelector('[data-testid="animation-action-guardian"]')
        ?.textContent?.includes('move'),
  );
  assert.match((await page.getByTestId('animation-action-traveler').textContent()) ?? '', /move/);
  assert.match((await page.getByTestId('animation-action-guardian').textContent()) ?? '', /move/);

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="reduced-motion-state"]')?.dataset.reducedMotion ===
      'false',
  );
  const activateByKeyboard = async (testId) => {
    const control = page.getByTestId(testId);
    await control.focus();
    await page.keyboard.press('Enter');
  };
  const initialCameraPosition = await page.evaluate(() =>
    window.__phase5ModelProbe?.camera.position.toArray(),
  );
  await activateByKeyboard('cinematic-play');
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="cinematic-status"]')?.textContent ===
      'Cinematic playing',
  );
  await activateByKeyboard('cinematic-pause');
  assert.equal(await page.getByTestId('cinematic-status').textContent(), 'Cinematic paused');
  await page.waitForTimeout(250);
  assert.equal(await page.getByTestId('cinematic-status').textContent(), 'Cinematic paused');
  await activateByKeyboard('cinematic-resume');
  const caption = page.getByTestId('cinematic-caption');
  await caption.waitFor({ state: 'visible' });
  assert.equal(await caption.getAttribute('dir'), 'rtl');
  assert.equal(await caption.getAttribute('lang'), 'fa');
  assert.match((await caption.textContent()) ?? '', /نگهبان/);
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="cinematic-status"]')?.textContent ===
      'Cinematic completed',
  );
  const stagedCameraPosition = await page.evaluate(() =>
    window.__phase5ModelProbe?.camera.position.toArray(),
  );
  assert.notDeepEqual(
    stagedCameraPosition,
    initialCameraPosition,
    'camera cue must stage the shot',
  );

  await activateByKeyboard('cinematic-play');
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="cinematic-status"]')?.textContent ===
      'Cinematic playing',
  );
  await activateByKeyboard('cinematic-skip');
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="cinematic-status"]')?.textContent ===
      'Cinematic completed',
  );
  await page.getByTestId('cinematic-caption').waitFor({ state: 'visible' });

  await activateByKeyboard('cinematic-play');
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="cinematic-status"]')?.textContent ===
      'Cinematic playing',
  );
  await activateByKeyboard('cinematic-cancel');
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="cinematic-status"]')?.textContent ===
      'Cinematic cancelled',
  );
  assert.equal(await page.getByTestId('cinematic-caption').count(), 0);
  await page.waitForFunction((initial) => {
    const current = window.__phase5ModelProbe?.camera.position.toArray();
    return current?.every((value, index) => Math.abs(value - initial[index]) < 0.0001);
  }, initialCameraPosition);
  const restoredCameraPosition = await page.evaluate(() =>
    window.__phase5ModelProbe?.camera.position.toArray(),
  );
  assert.deepEqual(
    restoredCameraPosition,
    initialCameraPosition,
    'cancel restores camera ownership',
  );

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="reduced-motion-state"]')?.dataset.reducedMotion ===
      'true',
  );
  await activateByKeyboard('cinematic-play');
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="cinematic-status"]')?.textContent ===
      'Cinematic completed',
  );
  assert.equal(await page.getByTestId('cinematic-caption').isVisible(), true);

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="reduced-motion-state"]')?.dataset.reducedMotion ===
      'false',
  );
  const sceneBeforeInterruptedReload = await page.evaluate(
    () => window.__phase5ModelProbe?.scene.uuid,
  );
  await activateByKeyboard('cinematic-play');
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="cinematic-status"]')?.textContent ===
      'Cinematic playing',
  );
  await activateByKeyboard('model-reload');
  await page.waitForFunction(
    (oldSceneId) =>
      document.querySelector('[data-testid="cinematic-status"]')?.textContent ===
        'Cinematic cancelled' &&
      window.__phase5ModelProbe?.scene.uuid !== oldSceneId &&
      document.querySelector('[data-testid="model-status-rigged"]')?.getAttribute('data-status') ===
        'ready',
    sceneBeforeInterruptedReload,
  );

  const sceneBeforeContextLoss = await page.evaluate(() => window.__phase5ModelProbe?.scene.uuid);
  await page.evaluate(() => window.__phase5ModelProbe?.renderer.forceContextLoss());
  await page.getByTestId('phase5-context-recover').waitFor({ state: 'visible' });
  await activateByKeyboard('phase5-context-recover');
  await page.waitForFunction(
    (oldSceneId) =>
      window.__phase5ModelProbe?.scene.uuid !== oldSceneId &&
      document.querySelector('[data-testid="model-status-static"]')?.getAttribute('data-status') ===
        'ready' &&
      document.querySelector('[data-testid="model-status-rigged"]')?.getAttribute('data-status') ===
        'ready',
    sceneBeforeContextLoss,
  );

  await page.waitForFunction(
    () =>
      (window.__phase5ModelProbe?.renderer.info.memory.geometries ?? 0) >= 4 &&
      (window.__phase5ModelProbe?.renderer.info.memory.textures ?? 0) >= 5,
  );
  const initialRendererMemory = await page.evaluate(() => ({
    geometries: window.__phase5ModelProbe?.renderer.info.memory.geometries ?? -1,
    textures: window.__phase5ModelProbe?.renderer.info.memory.textures ?? -1,
  }));
  assert.deepEqual(
    externalAssetRequests,
    [],
    'model loading must not contact a remote asset service',
  );
  for (let cycle = 0; cycle < 3; cycle += 1) {
    const previousSceneId = await page.evaluate(() => window.__phase5ModelProbe?.scene.uuid);
    await page.getByTestId('model-reload').click();
    await page.waitForFunction(
      (oldSceneId) =>
        window.__phase5ModelProbe?.scene.uuid !== oldSceneId &&
        document
          .querySelector('[data-testid="model-status-static"]')
          ?.getAttribute('data-status') === 'ready' &&
        document
          .querySelector('[data-testid="model-status-rigged"]')
          ?.getAttribute('data-status') === 'ready',
      previousSceneId,
    );
  }
  await page.waitForFunction(
    (baseline) =>
      (window.__phase5ModelProbe?.renderer.info.memory.geometries ?? 0) >= baseline.geometries &&
      (window.__phase5ModelProbe?.renderer.info.memory.textures ?? 0) >= baseline.textures,
    initialRendererMemory,
  );
  const finalRendererMemory = await page.evaluate(() => ({
    geometries: window.__phase5ModelProbe?.renderer.info.memory.geometries ?? -1,
    textures: window.__phase5ModelProbe?.renderer.info.memory.textures ?? -1,
  }));
  assert.ok(
    finalRendererMemory.geometries <= initialRendererMemory.geometries + 1,
    `repeated canvas reload geometry count grew: ${JSON.stringify({ initialRendererMemory, finalRendererMemory })}`,
  );
  assert.ok(
    finalRendererMemory.textures <= initialRendererMemory.textures + 1,
    `repeated canvas reload texture count grew: ${JSON.stringify({ initialRendererMemory, finalRendererMemory })}`,
  );
  await page.getByTestId('return-to-story').click();
  await page.waitForFunction(() => new URLSearchParams(location.search).get('phase5') === null);
  await page.waitForFunction(
    () =>
      document.querySelector('.demo-header h1')?.textContent === 'Three.js narrative integration' &&
      ['ready', 'recovery-required'].includes(
        document.querySelector('[data-testid="session-readiness"]')?.textContent ?? '',
      ),
  );
  assert.deepEqual(pageErrors, []);

  log(
    `independent Three.js consumer passed narrative, persistence, local static/rigged models, gameplay animation, cinematic controls/cleanup, context recovery, RTL/reduced-motion, and bounded renderer memory ${JSON.stringify({ initialRendererMemory, finalRendererMemory })}`,
  );
} finally {
  await browser?.close();
  await server.close();
}
