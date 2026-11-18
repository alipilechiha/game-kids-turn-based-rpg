import assert from 'node:assert/strict';
import { error as logError, log } from 'node:console';
import { cp, copyFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { URL, fileURLToPath, pathToFileURL } from 'node:url';
import { checkRuntimeFromTarball } from './check-framework-runtime.mjs';
import { runNpm, runNode } from './framework-consumer-support.mjs';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const fixtureRoot = path.join(repoRoot, 'packages', 'core-consumer');
const packageName = 'waypoint-rpg-core';
const modules = [
  'index',
  'identifiers',
  'world',
  'geometry',
  'graph',
  'pathfinding',
  'runtime',
  'persistence',
];

function expectedArchiveFiles() {
  const distFiles = modules.flatMap((moduleName) => [
    `dist/${moduleName}.d.ts`,
    `dist/${moduleName}.js`,
    `dist/${moduleName}.js.map`,
  ]);
  return ['LICENSE', 'README.md', 'package.json', ...distFiles].sort();
}

function verifyArchive(packResult) {
  assert.equal(packResult.name, packageName);
  assert.equal(packResult.version, '0.1.0');
  const actualFiles = packResult.files.map(({ path: filePath }) => filePath).sort();
  assert.deepEqual(actualFiles, expectedArchiveFiles());
  assert.ok(
    actualFiles.every((filePath) => !filePath.startsWith('src/') && !filePath.startsWith('test/')),
    'the tarball must contain only built output and package metadata',
  );
}

export async function checkFrameworkConsumer() {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'waypoint-rpg-tarball-consumer-'));
  const artifactRoot = path.join(temporaryRoot, 'artifact');
  const toolRoot = path.join(temporaryRoot, 'tool-consumer');
  try {
    await mkdir(artifactRoot);
    const packed = runNpm(
      [
        'pack',
        '--json',
        '--ignore-scripts',
        '--workspace=packages/core',
        '--pack-destination',
        artifactRoot,
      ],
      { cwd: repoRoot },
    );
    const [packResult] = JSON.parse(packed);
    assert.ok(packResult, 'npm pack must produce exactly one package');
    assert.equal(JSON.parse(packed).length, 1);
    verifyArchive(packResult);
    const tarballPath = path.join(artifactRoot, packResult.filename);

    await checkRuntimeFromTarball(tarballPath);

    await cp(fixtureRoot, toolRoot, {
      recursive: true,
      filter: (source) =>
        !source.split(path.sep).some((part) => ['node_modules', 'dist'].includes(part)),
    });
    runNpm(['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: toolRoot });
    runNpm(['ci', '--offline', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: toolRoot });
    log('framework developer tools: locked install and warm-cache offline npm ci passed');

    runNpm(
      [
        'install',
        '--offline',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--no-save',
        tarballPath,
      ],
      { cwd: toolRoot },
    );
    runNpm(['run', 'types:nodenext'], { cwd: toolRoot });
    runNpm(['run', 'types:bundler'], { cwd: toolRoot });
    runNpm(['run', 'build'], { cwd: toolRoot });

    if (process.env.FRAMEWORK_INSTALL_CHROMIUM === '1') {
      runNpm(['exec', '--', 'playwright', 'install', '--with-deps', 'chromium'], {
        cwd: toolRoot,
      });
    }
    runNode(['browser-smoke.mjs'], { cwd: toolRoot });

    const artifactOutput = process.env.FRAMEWORK_TARBALL_OUTPUT;
    if (artifactOutput) {
      const persistentOutput = path.resolve(artifactOutput);
      await mkdir(path.dirname(persistentOutput), { recursive: true });
      await copyFile(tarballPath, persistentOutput);
    }

    log(
      'framework consumer: tarball inventory, isolated install, NodeNext/Bundler types, Vite build, and Chromium passed',
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    await checkFrameworkConsumer();
  } catch (error) {
    logError(error);
    process.exitCode = 1;
  }
}
