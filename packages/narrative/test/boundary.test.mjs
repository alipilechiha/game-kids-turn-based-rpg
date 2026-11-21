import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { analyzeSourceText, checkBoundary, validateManifest } from '../scripts/check-boundary.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const packageManifest = JSON.parse(await readFile(path.join(here, '..', 'package.json'), 'utf8'));

test('package manifest is ESM, root-only, and dependency-free at runtime', () => {
  assert.deepEqual(validateManifest(packageManifest), []);
  assert.deepEqual(Object.keys(packageManifest.exports), ['.']);
});

test('source boundary rejects external, parent, dynamic, and CommonJS imports', () => {
  for (const source of [
    "import React from 'react';",
    "import { x } from '../application.ts';",
    "import('./lazy.js');",
    "const x = require('node:fs');",
    "const x = eval('1 + 1');",
    "export * from './internal.js';",
  ]) {
    assert.notEqual(analyzeSourceText(source, 'src/check.ts').length, 0, source);
  }
  assert.deepEqual(analyzeSourceText("import { x } from './local.js';", 'src/index.ts'), []);
  assert.notEqual(
    analyzeSourceText(
      "import { x } from './missing.js';",
      'src/index.ts',
      new Set(['src/index.ts']),
    ).length,
    0,
  );
});

test('boundary policy rejects runtime dependencies and deep package exports', () => {
  assert.ok(validateManifest({ ...packageManifest, dependencies: { react: '19.0.0' } }).length > 0);
  assert.ok(
    validateManifest({
      ...packageManifest,
      exports: { ...packageManifest.exports, './internal': './src/internal.ts' },
    }).length > 0,
  );
});

test('all current library source conforms to the exact public boundary', async () => {
  const result = await checkBoundary();
  assert.ok(result.sourceCount >= 6);
  assert.ok(result.exportCount >= 30);
});
