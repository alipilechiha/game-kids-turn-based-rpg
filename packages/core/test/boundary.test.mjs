import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyzeSourceText,
  declaredExportNames,
  validateManifest,
} from '../scripts/check-boundary.mjs';

const packageSources = new Set(['src/index.ts', 'src/identifiers.ts', 'src/world.ts']);

test('allows ESM imports that resolve to sibling package source', () => {
  const errors = analyzeSourceText(
    "import type { AnchorId } from './identifiers.js';\nexport { Anchor } from './world.js';",
    'src/index.ts',
    packageSources,
  );

  assert.deepEqual(errors, []);
});

test('rejects external and parent-path imports', () => {
  const errors = analyzeSourceText(
    "import React from 'react';\nimport type { State } from '../../../src/app/state.js';",
    'src/index.ts',
    packageSources,
  );

  assert.equal(errors.length, 2);
  assert.match(errors.join('\n'), /react/);
  assert.match(errors.join('\n'), /state\.js/);
});

test('rejects dynamic imports, CommonJS require, and external type references', () => {
  const errors = analyzeSourceText(
    [
      '/// <reference types="node" />',
      "const lazy = import('./world.js');",
      "const runtime = require('three');",
    ].join('\n'),
    'src/index.ts',
    packageSources,
  );

  assert.equal(errors.length, 3);
  assert.match(errors.join('\n'), /reference/);
  assert.match(errors.join('\n'), /dynamic import/);
  assert.match(errors.join('\n'), /require/);
});

test('rejects captured require references and nested CommonJS exports', () => {
  const errors = analyzeSourceText(
    ['const nodeRequire = require;', 'module.exports.runtime = createGameRuntime;'].join('\n'),
    'src/index.ts',
    packageSources,
  );

  assert.equal(errors.length, 2);
  assert.match(errors.join('\n'), /require/);
  assert.match(errors.join('\n'), /CommonJS exports/);
});

test('rejects internal imports that do not resolve to a packaged source file', () => {
  const errors = analyzeSourceText(
    "export { Anchor } from './missing.js';",
    'src/index.ts',
    packageSources,
  );

  assert.equal(errors.length, 1);
  assert.match(errors[0], /missing\.js/);
});

test('rejects parent-segment imports even when they resolve inside package source', () => {
  const errors = analyzeSourceText(
    "import type { Anchor } from './../world.js';",
    'src/sub/feature.ts',
    packageSources,
  );

  assert.equal(errors.length, 1);
  assert.match(errors[0], /disallowed module specifier/);
});

test('requires a private ESM package with root-only exports and no runtime dependencies', () => {
  const manifest = {
    name: 'waypoint-rpg-core',
    version: '0.1.0',
    license: 'MIT',
    private: true,
    type: 'module',
    sideEffects: false,
    files: ['dist', 'README.md', 'LICENSE'],
    exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js' } },
    engines: { node: '>=22.0.0' },
    devDependencies: { typescript: '6.0.3' },
  };

  assert.deepEqual(validateManifest(manifest), []);
  assert.match(
    validateManifest({ ...manifest, dependencies: { three: '0.186.0' } }).join('\n'),
    /dependencies/,
  );
  assert.match(
    validateManifest({
      ...manifest,
      exports: { ...manifest.exports, './internal': './src/internal.js' },
    }).join('\n'),
    /root export/,
  );
  assert.match(
    validateManifest({
      ...manifest,
      exports: { '.': { ...manifest.exports['.'], require: './dist/index.cjs' } },
    }).join('\n'),
    /root export conditions/,
  );
  assert.match(
    validateManifest({
      ...manifest,
      devDependencies: { typescript: '6.0.3', eslint: '10.0.0' },
    }).join('\n'),
    /development dependency inventory/,
  );
  assert.match(validateManifest({ ...manifest, license: 'UNLICENSED' }).join('\n'), /MIT/);
  assert.match(validateManifest({ ...manifest, version: '1.0.0' }).join('\n'), /version/);
  assert.match(
    validateManifest({ ...manifest, bundleDependencies: ['three'] }).join('\n'),
    /bundleDependencies/,
  );
});

test('extracts the exact named type and value exports from the public entry', () => {
  const source = [
    "export type { AnchorId, WorldMap as MapDto } from './world.js';",
    "export { findPath, createGameRuntime as makeRuntime } from './runtime.js';",
  ].join('\n');

  assert.deepEqual(declaredExportNames(source), ['AnchorId', 'MapDto', 'findPath', 'makeRuntime']);
});
