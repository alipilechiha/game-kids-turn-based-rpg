import assert from 'node:assert/strict';
import { log } from 'node:console';
import { chromium } from '@playwright/test';
import { preview } from 'vite';

/* global document, getComputedStyle, localStorage, window */

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
  await page.keyboard.press('Enter');
  await page.getByTestId('dialogue-advance').waitFor({ state: 'visible' });
  assert.match(await page.locator('#narrative-text').textContent(), /ردّ برگ/);
  assert.equal(await hasFocus(page.getByTestId('dialogue-advance')), true);

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
  assert.equal(await camera.textContent(), 'orthographic');
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

  const triggerFeedbackToken = await page
    .getByTestId('command-feedback')
    .getAttribute('data-command-token');
  await page.getByTestId('lantern-interaction').click();
  await page.waitForFunction(
    (previousToken) =>
      document
        .querySelector('[data-testid="command-feedback"]')
        ?.getAttribute('data-command-token') !== previousToken,
    triggerFeedbackToken,
  );
  const triggerResult = await page.evaluate(() => ({
    accepted: document
      .querySelector('[data-testid="command-feedback"]')
      ?.getAttribute('data-command-accepted'),
    reason: document.querySelector('[data-testid="command-feedback"]')?.textContent,
    probe: window.__sceneProbe,
  }));
  assert.equal(
    triggerResult.accepted,
    'true',
    `Lantern trigger was rejected: ${JSON.stringify(triggerResult)}`,
  );
  assert.equal(
    triggerResult.probe?.lampLit,
    true,
    `Lantern projection did not update: ${JSON.stringify(triggerResult)}`,
  );
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
  assert.match(await page.locator('#narrative-text').textContent(), /ردّ برگ/);
  await page.keyboard.press('Enter');
  await page.getByTestId('dialogue-choice-end-with-truth').waitFor({ state: 'visible' });
  assert.equal(await page.getByTestId('dialogue-choice-end-with-truth').isEnabled(), true);
  assert.equal(await page.getByTestId('dialogue-choice-end-with-anger').isDisabled(), true);
  await page.keyboard.press('Enter');
  await page.getByTestId('dialogue-finish').waitFor({ state: 'visible' });
  assert.match(await page.locator('#narrative-text').textContent(), /چراغ روشن/);
  await page.keyboard.press('Enter');
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
  assert.equal(await page.getByTestId('lantern-interaction').isDisabled(), true);
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
  await page.getByTestId('dialogue-open').click();
  await page.getByTestId('narrative-dialog').waitFor({ state: 'visible' });
  assert.equal(
    await page.evaluate(() => localStorage.getItem('waypoint-rpg-scene-demo:save')),
    corruptSave,
    'session-only recovery must leave the original malformed bytes untouched',
  );
  assert.deepEqual(pageErrors, []);

  log(
    'independent Three.js narrative consumer passed Chromium branches, modal, RTL, recovery, persistence, and lifecycle smoke',
  );
} finally {
  await browser?.close();
  await server.close();
}
