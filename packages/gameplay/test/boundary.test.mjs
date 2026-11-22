import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { analyzeSourceText, checkBoundary, validateManifest } from '../scripts/check-boundary.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(await readFile(path.join(here, '..', 'package.json'), 'utf8'));

test('gameplay manifest is optional, ESM, root-only, and runtime dependency-free', () => {
  assert.deepEqual(validateManifest(manifest), []);
  assert.deepEqual(Object.keys(manifest.exports), ['.']);
});

test('gameplay source rejects package and application imports or executable loading', () => {
  for (const source of [
    "import { createGameRuntime } from 'waypoint-rpg-core';",
    "import React from 'react';",
    "import { rule } from '../narrative/src/index.js';",
    "import('./dynamic.js');",
    "const value = require('node:fs');",
    "const value = eval('1');",
    "export * from './internal.js';",
  ]) {
    assert.notEqual(
      analyzeSourceText(source, 'src/sample.ts', new Set(['src/sample.ts'])).length,
      0,
      source,
    );
  }
  assert.deepEqual(
    analyzeSourceText(
      "import { helper } from './helper.js';",
      'src/index.ts',
      new Set(['src/index.ts', 'src/helper.ts']),
    ),
    [],
  );
});

test('manifest policy rejects runtime dependencies, Node drift, and package subpaths', () => {
  assert.ok(
    validateManifest({ ...manifest, dependencies: { 'waypoint-rpg-narrative': '0.1.0' } }).length >
      0,
  );
  assert.ok(validateManifest({ ...manifest, engines: { node: '>=22.22.2' } }).length > 0);
  assert.ok(
    validateManifest({
      ...manifest,
      exports: { ...manifest.exports, './internal': './dist/internal.js' },
    }).length > 0,
  );
});

test('all gameplay source conforms to the exact root public API and import boundary', async () => {
  const result = await checkBoundary();
  assert.ok(result.sourceCount >= 4);
  assert.ok(result.exportCount >= 40);
});
