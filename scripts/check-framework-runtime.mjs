import assert from 'node:assert/strict';
import { error as logError, log } from 'node:console';
import { copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { URL, fileURLToPath, pathToFileURL } from 'node:url';
import { runNpm, runNode } from './framework-consumer-support.mjs';

const fixtureRoot = fileURLToPath(new URL('../packages/core-consumer/', import.meta.url));

export async function checkRuntimeFromTarball(tarballPath) {
  const resolvedTarball = path.resolve(tarballPath);
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'waypoint-rpg-runtime-consumer-'));
  const emptyCache = path.join(temporaryRoot, 'empty-cache');
  const projectRoot = path.join(temporaryRoot, 'project');
  try {
    await mkdir(emptyCache);
    await mkdir(projectRoot);
    await writeFile(
      path.join(projectRoot, 'package.json'),
      JSON.stringify(
        { name: 'isolated-waypoint-consumer', private: true, type: 'module' },
        null,
        2,
      ),
    );
    await copyFile(
      path.join(fixtureRoot, 'runtime-smoke.mjs'),
      path.join(projectRoot, 'runtime-smoke.mjs'),
    );
    await copyFile(
      path.join(fixtureRoot, 'source-map-probe.mjs'),
      path.join(projectRoot, 'source-map-probe.mjs'),
    );

    runNpm(
      [
        'install',
        '--offline',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--cache',
        emptyCache,
        resolvedTarball,
      ],
      { cwd: projectRoot },
    );

    const resolvedOutput = runNode(['--enable-source-maps', 'runtime-smoke.mjs'], {
      cwd: projectRoot,
    });
    assert.match(resolvedOutput, /isolated native ESM consumer passed/);

    let sourceMapError;
    try {
      runNode(['--enable-source-maps', 'source-map-probe.mjs'], { cwd: projectRoot });
    } catch (error) {
      sourceMapError = error;
    }
    assert.ok(sourceMapError, 'the deliberate missing-anchor lookup must throw');
    assert.notEqual(sourceMapError.status, 0);
    const sourceMapTrace = String(sourceMapError.stderr ?? '').replaceAll('\\', '/');
    assert.match(sourceMapTrace, /Unknown anchor: anchor-missing/);
    assert.match(
      sourceMapTrace,
      /node_modules\/waypoint-rpg-core\/src\/graph\.ts:\d+:\d+/,
      'native source maps must identify the original graph.ts source',
    );

    log('framework runtime: empty-cache offline install and native ESM passed');
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function main() {
  const tarballPath = process.argv[2];
  if (!tarballPath) throw new Error('Provide a built waypoint-rpg-core .tgz path.');
  await readFile(path.resolve(tarballPath));
  await checkRuntimeFromTarball(tarballPath);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    await main();
  } catch (error) {
    logError(error);
    process.exitCode = 1;
  }
}
