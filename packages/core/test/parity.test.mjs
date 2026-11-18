import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkFrameworkParity,
  normalizeFrameworkSource,
} from '../../../scripts/check-framework-parity.mjs';

test('normalizes only line endings and relative TypeScript ESM specifiers', () => {
  assert.equal(
    normalizeFrameworkSource("import type { Anchor } from './world.ts';\r\n"),
    "import type { Anchor } from './world.js';\n",
  );
});

test('package snapshot stays in parity with the application sources', async () => {
  assert.deepEqual(await checkFrameworkParity(), []);
});
