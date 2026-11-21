import assert from 'node:assert/strict';
import { log } from 'node:console';
import { chromium } from '@playwright/test';
import { preview } from 'vite';

/* global document, window */

const server = await preview({
  preview: { host: '127.0.0.1', port: 0, strictPort: false },
});
let browser;

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
  await page.waitForFunction(() => window.__sceneProbe?.cameraKind === 'perspective');
  assert.equal(await map.textContent(), 'map-courtyard');
  assert.equal(await camera.textContent(), 'perspective');
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

  await page.getByTestId('lamp-toggle').click();
  await page.getByTestId('scene-transition').click();
  try {
    await page.waitForFunction(
      (baselineSubscriptions) =>
        document.querySelector('[data-testid="active-map"]')?.textContent === 'map-workshop' &&
        window.__sceneProbe?.cameraIsOrthographic === true &&
        window.__sceneProbe?.lampLit === true &&
        (window.__sceneProbe?.runtimeSubscriptions ?? 0) >= baselineSubscriptions,
      baselineRuntimeSubscriptions,
      { timeout: 12_000 },
    );
  } catch (error) {
    const state = await page.evaluate(() => ({
      map: document.querySelector('[data-testid="active-map"]')?.textContent,
      camera: document.querySelector('[data-testid="camera-kind"]')?.textContent,
      transition: document.querySelector('[data-testid="scene-transition"]')?.textContent,
      sceneError: document.querySelector('[data-testid="scene-error"]')?.textContent,
      probe: window.__sceneProbe,
    }));
    throw new Error(`Workshop transition did not settle: ${JSON.stringify(state)}`, {
      cause: error,
    });
  }
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
  const workshopSubscriptions = await page.evaluate(
    () => window.__sceneProbe?.runtimeSubscriptions,
  );

  await page.getByTestId('lamp-toggle').click();
  await page.waitForFunction(() => window.__sceneProbe?.lampLit === false);
  await page.getByTestId('lamp-toggle').click();
  await page.waitForFunction(() => window.__sceneProbe?.lampLit === true);

  await page.getByTestId('scene-transition').click();
  await page.waitForFunction(
    (subscriptionCount) =>
      document.querySelector('[data-testid="active-map"]')?.textContent === 'map-courtyard' &&
      window.__sceneProbe?.runtimeSubscriptions === subscriptionCount,
    workshopSubscriptions,
  );
  assert.equal(
    await canvas.evaluate(
      (element) => element.isConnected && element === window.__originalSceneCanvas,
    ),
    true,
    'a return transition must preserve the mounted canvas element',
  );

  await page.getByTestId('scene-transition').click();
  await page.waitForFunction(
    (subscriptionCount) =>
      document.querySelector('[data-testid="active-map"]')?.textContent === 'map-workshop' &&
      window.__sceneProbe?.runtimeSubscriptions === subscriptionCount,
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
  assert.equal(await map.textContent(), 'map-workshop');
  const recoveredSubscriptions = await page.evaluate(
    () => window.__sceneProbe?.runtimeSubscriptions,
  );
  assert.ok(
    Number.isInteger(recoveredSubscriptions) && recoveredSubscriptions >= 1,
    'the runtime subscription probe remains available after context recovery',
  );
  await page.getByTestId('lamp-toggle').click();
  await page.waitForFunction(() => window.__sceneProbe?.lampLit === false);
  await page.getByTestId('lamp-toggle').click();
  await page.waitForFunction(() => window.__sceneProbe?.lampLit === true);
  assert.deepEqual(pageErrors, []);

  log('independent Three.js scene consumer passed Chromium lifecycle smoke');
} finally {
  await browser?.close();
  await server.close();
}
