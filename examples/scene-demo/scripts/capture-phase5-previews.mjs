import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { resolve } from 'node:path';
import { preview } from 'vite';

const repositoryRoot = resolve(process.cwd(), '../..');
const outputDirectory = resolve(repositoryRoot, 'docs/previews/phase5');
const manifestPath = resolve(outputDirectory, 'provenance.json');
const fileNames = ['01-external-models.png', '02-guardian-cinematic.png'];
let browser;
let server;

function screenshotRecord(file) {
  const path = resolve(outputDirectory, file);
  const bytes = readFileSync(path);
  assert.ok(statSync(path).size > 5_000, `Screenshot is unexpectedly small: ${file}`);
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  assert.ok(width > 300 && height > 300, `Screenshot dimensions are too small: ${file}`);
  return {
    file,
    width,
    height,
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

try {
  const dirtyRuntime = execFileSync(
    'git',
    [
      'status',
      '--porcelain',
      '--',
      'examples/scene-demo/src',
      'examples/scene-demo/index.html',
      'examples/scene-demo/vite.config.ts',
    ],
    { cwd: repositoryRoot, encoding: 'utf8' },
  );
  assert.equal(
    dirtyRuntime,
    '',
    'Commit scene-demo runtime files before recording screenshot provenance',
  );
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trim();
  assert.match(sourceCommit, /^[0-9a-f]{40}$/);
  mkdirSync(outputDirectory, { recursive: true });

  server = await preview({ preview: { host: '127.0.0.1', port: 0, strictPort: false } });
  const address = server.httpServer.address();
  assert.ok(address && typeof address === 'object', 'Vite preview must use an ephemeral port');
  browser = await chromium.launch({
    headless: true,
    args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: 1365, height: 1000 } });
  const pageErrors = [];
  const offOriginRequests = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => {
    const requestUrl = new URL(request.url());
    if (requestUrl.origin !== `http://127.0.0.1:${address.port}`)
      offOriginRequests.push(requestUrl.href);
  });

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(`http://127.0.0.1:${address.port}/?phase5=assets`, {
    waitUntil: 'networkidle',
  });
  await page.waitForFunction(() =>
    ['static', 'traveler', 'guardian'].every(
      (id) =>
        document
          .querySelector(`[data-testid="model-status-${id}"]`)
          ?.getAttribute('data-status') === 'ready',
    ),
  );
  await page.waitForFunction(
    () =>
      (window.__phase5ModelProbe?.renderer.info.memory.geometries ?? 0) >= 4 &&
      (window.__phase5ModelProbe?.renderer.info.memory.textures ?? 0) >= 5,
  );

  await page.getByTestId('model-asset-select').selectOption('phase5-khronos-box');
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="model-status-static"]')?.getAttribute('data-status') ===
      'ready',
  );
  await page.getByTestId('rigged-asset-select').selectOption('phase5-khronos-rigged-figure');
  await page.waitForFunction(() =>
    ['traveler', 'guardian'].every(
      (id) =>
        document
          .querySelector(`[data-testid="model-status-${id}"]`)
          ?.getAttribute('data-status') === 'ready',
    ),
  );
  await page.screenshot({
    path: resolve(outputDirectory, fileNames[0]),
    fullPage: true,
    animations: 'disabled',
    caret: 'hide',
  });

  await page.getByTestId('model-asset-select').selectOption('phase5-textured-static');
  await page.getByTestId('rigged-asset-select').selectOption('phase5-animated-guardian');
  await page.waitForFunction(() =>
    ['static', 'traveler', 'guardian'].every(
      (id) =>
        document
          .querySelector(`[data-testid="model-status-${id}"]`)
          ?.getAttribute('data-status') === 'ready',
    ),
  );
  const initialCameraPosition = await page.evaluate(() =>
    window.__phase5ModelProbe?.camera.position.toArray(),
  );
  await page.getByTestId('cinematic-play').focus();
  await page.keyboard.press('Enter');
  await page.getByTestId('cinematic-caption').waitFor({ state: 'visible' });
  assert.equal(await page.getByTestId('cinematic-caption').getAttribute('dir'), 'rtl');
  await page.waitForFunction((initial) => {
    const current = window.__phase5ModelProbe?.camera.position.toArray();
    return current?.some((value, index) => Math.abs(value - initial[index]) > 0.05);
  }, initialCameraPosition);
  await page.screenshot({
    path: resolve(outputDirectory, fileNames[1]),
    fullPage: true,
    animations: 'disabled',
    caret: 'hide',
  });
  assert.deepEqual(offOriginRequests, [], 'local model and story routes must remain offline');
  assert.deepEqual(pageErrors, [], 'source-rendered capture must have no unhandled browser errors');

  const assetRecords = JSON.parse(
    readFileSync(
      resolve(repositoryRoot, 'examples/scene-demo/src/animation/asset-records.json'),
      'utf8',
    ),
  );
  const imageRecords = fileNames.map(screenshotRecord);
  const modelRecords = assetRecords
    .filter((asset) => asset.id.startsWith('phase5-khronos-'))
    .map(({ id, sourceSha256, outputSha256, rights }) => ({
      id,
      sourceSha256,
      outputSha256,
      licenseId: rights.licenseId,
    }));
  assert.equal(modelRecords.length, 2);
  writeFileSync(
    manifestPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        sourceCommit,
        browser: 'Chromium via Playwright, headless SwiftShader',
        viewport: { width: 1365, height: 1000 },
        images: imageRecords,
        models: modelRecords,
      },
      null,
      2,
    )}\n`,
  );
  console.log(
    'Captured external GLB and rendered guardian cinematic screenshots from the production build.',
  );
} finally {
  await browser?.close();
  await server?.close();
}
