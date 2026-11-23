import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { resolve } from 'node:path';

const repoRoot = resolve(process.cwd(), '../..');
const output = resolve(repoRoot, 'docs/previews/blood-leaf');
const manifestPath = resolve(output, 'provenance.json');
const fileNames = ['01-courtyard.png', '02-dialogue.png', '03-lit-lantern.png'];
let browser;
let server;

function screenshotRecord(file) {
  const path = resolve(output, file);
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
    { cwd: repoRoot, encoding: 'utf8' },
  );
  assert.equal(dirtyRuntime, '', 'Commit scene-demo runtime files before recording provenance');
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim();
  assert.match(sourceCommit, /^[0-9a-f]{40}$/);
  mkdirSync(output, { recursive: true });
  const previous = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null;
  const pageErrors = [];

  server = await preview({
    preview: { host: '127.0.0.1', port: 0, strictPort: false },
  });
  const address = server.httpServer.address();
  assert.ok(address && typeof address === 'object', 'Preview must bind an ephemeral port');
  browser = await chromium.launch({
    headless: true,
    args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 }, locale: 'fa-IR' });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(`http://127.0.0.1:${address.port}/`);
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="session-readiness"]')?.textContent === 'ready' &&
      window.__sceneProbe?.cameraKind === 'perspective' &&
      window.__sceneProbe?.frameCount > 0,
  );
  await page.screenshot({
    path: resolve(output, fileNames[0]),
    fullPage: true,
    animations: 'disabled',
    caret: 'hide',
  });

  await page.getByTestId('dialogue-open').click();
  await page.getByTestId('narrative-dialog').waitFor({ state: 'visible' });
  await page.getByTestId('dialogue-choice-seek-truth').waitFor({ state: 'visible' });
  await page.screenshot({
    path: resolve(output, fileNames[1]),
    fullPage: true,
    animations: 'disabled',
    caret: 'hide',
  });
  await page.getByTestId('dialogue-choice-seek-truth').click();
  await page.getByTestId('dialogue-leave').click();
  await page.getByTestId('scene-transition').click();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="active-map"]')?.textContent === 'map-workshop' &&
      window.__sceneProbe?.cameraIsOrthographic === true &&
      window.__sceneProbe?.lampLit === false,
  );
  // The courtyard conversation remains suspended while the player is away.
  // Return to its owning scene and close it before investigating the clue.
  await page.getByTestId('scene-transition').click();
  await page.waitForFunction(
    () => document.querySelector('[data-testid="active-map"]')?.textContent === 'map-courtyard',
  );
  await page.getByTestId('dialogue-open').click();
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
  await page.getByTestId('dialogue-choice-investigate-clue').click();
  await page.getByTestId('dialogue-close').click();
  await page.waitForFunction(
    () => document.querySelector('[data-testid="clue-status"]')?.dataset.resolved === 'true',
  );
  await page.waitForFunction(() => window.__sceneProbe?.lampLit === true);
  await page.screenshot({
    path: resolve(output, fileNames[2]),
    fullPage: true,
    animations: 'disabled',
    caret: 'hide',
  });
  assert.deepEqual(pageErrors, [], 'No unhandled browser errors during Blood Leaf capture');

  const images = fileNames.map(screenshotRecord);
  const oldHashes = new Map((previous?.images ?? []).map((image) => [image.file, image.sha256]));
  const changed = images.some((image) => oldHashes.get(image.file) !== image.sha256);
  const manifest = {
    schemaVersion: 1,
    sourceCommit:
      changed || previous?.sourceCommit === undefined ? sourceCommit : previous.sourceCommit,
    images,
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log('Captured real Blood Leaf courtyard, dialogue, and lit-lantern screenshots.');
} finally {
  await browser?.close();
  await server?.close();
}

function existsSync(path) {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}
