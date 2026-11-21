import assert from 'node:assert/strict';
import { log } from 'node:console';
import { chromium } from '@playwright/test';
import { preview } from 'vite';

const server = await preview({
  preview: { host: '127.0.0.1', port: 0, strictPort: false },
});
let browser;
try {
  const address = server.httpServer.address();
  assert.ok(
    address && typeof address === 'object',
    'Vite preview must listen on an ephemeral port',
  );
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: 'networkidle' });
  await page.locator('#path').waitFor({ state: 'visible' });
  assert.equal(
    await page.locator('#path').evaluate((element) => element.value),
    'anchor-start,anchor-finish',
  );
  assert.deepEqual(pageErrors, []);
  log('isolated Chromium consumer passed');
} finally {
  await browser?.close();
  await server.close();
}
