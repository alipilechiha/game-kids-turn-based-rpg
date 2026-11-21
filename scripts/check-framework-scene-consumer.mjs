import assert from 'node:assert/strict';
import { error as logError, log } from 'node:console';
import { cp, mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { URL, fileURLToPath, pathToFileURL } from 'node:url';
import { runNpm } from './framework-consumer-support.mjs';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const exampleRoot = path.join(repoRoot, 'examples', 'scene-demo');

async function getTarball(temporaryRoot) {
  const providedTarball = process.env.FRAMEWORK_TARBALL_OUTPUT;
  if (providedTarball) {
    const resolved = path.resolve(providedTarball);
    await readFile(resolved);
    return resolved;
  }

  const artifactRoot = path.join(temporaryRoot, 'artifact');
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
  assert.ok(packResult, 'npm pack must produce exactly one core package');
  assert.equal(packResult.name, 'waypoint-rpg-core');
  assert.equal(packResult.version, '0.1.0');
  assert.equal(JSON.parse(packed).length, 1);
  return path.join(artifactRoot, packResult.filename);
}

export async function checkFrameworkSceneConsumer() {
  const temporaryDirectory = await realpath(os.tmpdir());
  const temporaryRoot = await mkdtemp(
    path.join(temporaryDirectory, 'waypoint-rpg-scene-consumer-'),
  );
  const consumerRoot = path.join(temporaryRoot, 'consumer');

  try {
    await cp(exampleRoot, consumerRoot, {
      recursive: true,
      filter: (source) =>
        !source.split(path.sep).some((part) => ['node_modules', 'dist'].includes(part)),
    });

    runNpm(['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: consumerRoot });
    log('scene consumer development tools: locked npm ci passed');

    const tarballPath = await getTarball(temporaryRoot);
    const manifestPath = path.join(consumerRoot, 'package.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const relativeTarballPath = path.relative(consumerRoot, tarballPath).replaceAll(path.sep, '/');
    manifest.dependencies = {
      ...manifest.dependencies,
      'waypoint-rpg-core': `file:${relativeTarballPath}`,
    };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    runNpm(['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund'], {
      cwd: consumerRoot,
    });
    const resolved = runNpm(['ls', '--parseable', '--depth=0', 'waypoint-rpg-core'], {
      cwd: consumerRoot,
    });
    const resolvedEntries = await Promise.all(
      resolved
        .trim()
        .split(/\r?\n/)
        .filter(Boolean)
        .map((entry) => realpath(path.resolve(entry))),
    );
    const modulesRoot = await realpath(path.join(consumerRoot, 'node_modules'));
    const packageRoot = await realpath(path.join(modulesRoot, 'waypoint-rpg-core'));
    const packageRelativePath = path.relative(modulesRoot, packageRoot);
    assert.ok(
      packageRelativePath &&
        !packageRelativePath.startsWith('..') &&
        !path.isAbsolute(packageRelativePath),
      'the installed core package must be inside the independent consumer node_modules',
    );
    assert.ok(
      resolvedEntries.includes(packageRoot),
      'npm must resolve the core from the independent consumer installation',
    );

    const chromiumInstallArgs = ['exec', '--', 'playwright', 'install'];
    if (process.env.FRAMEWORK_INSTALL_CHROMIUM === '1') chromiumInstallArgs.push('--with-deps');
    chromiumInstallArgs.push('chromium');
    if (process.env.FRAMEWORK_INSTALL_CHROMIUM) {
      runNpm(chromiumInstallArgs, { cwd: consumerRoot });
    }

    runNpm(['run', 'typecheck'], { cwd: consumerRoot });
    runNpm(['run', 'test'], { cwd: consumerRoot });
    runNpm(['run', 'build'], { cwd: consumerRoot });
    runNpm(['run', 'test:e2e'], { cwd: consumerRoot });
    log(
      'framework scene consumer: offline tarball install, typecheck, unit tests, Vite build, and Chromium lifecycle smoke passed',
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    await checkFrameworkSceneConsumer();
  } catch (error) {
    logError(error);
    process.exitCode = 1;
  }
}
