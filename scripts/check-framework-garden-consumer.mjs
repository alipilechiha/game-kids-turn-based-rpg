import assert from 'node:assert/strict';
import { error as logError, log } from 'node:console';
import { cp, mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { URL, fileURLToPath, pathToFileURL } from 'node:url';
import { runNode, runNpm } from './framework-consumer-support.mjs';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const sampleRoot = path.join(repoRoot, 'examples', 'garden-adventure');
const frameworkPackages = [
  { name: 'waypoint-rpg-core', workspace: 'packages/core' },
  { name: 'waypoint-rpg-narrative', workspace: 'packages/narrative' },
];

async function packFrameworkPackage(artifactRoot, { name, workspace }) {
  const output = runNpm(
    [
      'pack',
      '--json',
      '--ignore-scripts',
      `--workspace=${workspace}`,
      '--pack-destination',
      artifactRoot,
    ],
    { cwd: repoRoot },
  );
  const results = JSON.parse(output);
  assert.equal(results.length, 1, `npm pack must produce exactly one ${name} archive`);
  assert.equal(results[0].name, name);
  return path.join(artifactRoot, results[0].filename);
}

async function installToolchain(consumerRoot) {
  const packagePath = path.join(consumerRoot, 'package.json');
  const lockPath = path.join(consumerRoot, 'package-lock.json');
  const manifest = JSON.parse(await readFile(packagePath, 'utf8'));
  const lock = JSON.parse(await readFile(lockPath, 'utf8'));

  for (const { name } of frameworkPackages) {
    delete manifest.dependencies[name];
    delete lock.packages[''].dependencies[name];
    delete lock.packages[`node_modules/${name}`];
    delete lock.packages[`../../packages/${name.replace('waypoint-rpg-', '')}`];
  }

  await writeFile(packagePath, `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  runNpm(['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: consumerRoot });
  log('Garden consumer development toolchain: locked npm ci passed');
}

async function installArchives(consumerRoot, artifactRoot, archives) {
  const packagePath = path.join(consumerRoot, 'package.json');
  const manifest = JSON.parse(await readFile(packagePath, 'utf8'));
  for (const { name, archive } of archives) {
    manifest.dependencies[name] =
      `file:${path.relative(consumerRoot, archive).replaceAll(path.sep, '/')}`;
  }
  await writeFile(packagePath, `${JSON.stringify(manifest, null, 2)}\n`);
  runNpm(['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund'], {
    cwd: consumerRoot,
  });

  const modulesRoot = await realpath(path.join(consumerRoot, 'node_modules'));
  for (const { name } of archives) {
    const packageRoot = await realpath(path.join(modulesRoot, name));
    assert.ok(
      packageRoot.startsWith(`${modulesRoot}${path.sep}`),
      `${name} must resolve from the independent consumer installation`,
    );
  }
  log('Garden consumer framework packages: local archives installed offline');
}

async function checkPublicImports(consumerRoot) {
  const sourceRoot = path.join(consumerRoot, 'src');
  const { readdir } = await import('node:fs/promises');
  const files = await readdir(sourceRoot, { recursive: true, withFileTypes: true });
  for (const entry of files) {
    if (!entry.isFile() || !/\.[jt]sx?$/.test(entry.name)) continue;
    const file = path.join(entry.parentPath, entry.name);
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(
      source,
      /(?:from\s*|import\s*\()["']waypoint-rpg-(?:core|narrative)\//,
      `Framework deep imports are not public APIs: ${path.relative(consumerRoot, file)}`,
    );
    assert.doesNotMatch(
      source,
      /(?:from\s*|import\s*\()["'][^"']*(?:scene-demo|src\/framework|packages\/(?:core|narrative)\/src)/,
      `The sample must not import repository-private implementation: ${path.relative(consumerRoot, file)}`,
    );
  }
}

export async function checkFrameworkGardenConsumer() {
  const temporaryRoot = await mkdtemp(path.join(await realpath(os.tmpdir()), 'waypoint-garden-'));
  const consumerRoot = path.join(temporaryRoot, 'consumer');
  const artifactRoot = path.join(temporaryRoot, 'artifacts');

  try {
    await mkdir(artifactRoot, { recursive: true });
    await cp(sampleRoot, consumerRoot, {
      recursive: true,
      filter: (source) =>
        !source
          .split(path.sep)
          .some((part) =>
            ['node_modules', 'dist', 'playwright-report', 'test-results'].includes(part),
          ),
    });

    const archives = [];
    for (const frameworkPackage of frameworkPackages) {
      archives.push({
        ...frameworkPackage,
        archive: await packFrameworkPackage(artifactRoot, frameworkPackage),
      });
    }

    await installToolchain(consumerRoot);
    await installArchives(consumerRoot, artifactRoot, archives);
    await checkPublicImports(consumerRoot);

    runNode(
      [
        '--input-type=module',
        '-e',
        "import { createGameRuntime, findPath } from 'waypoint-rpg-core'; import { compileNarrative, validateNarrative } from 'waypoint-rpg-narrative'; if (![createGameRuntime, findPath, compileNarrative, validateNarrative].every((item) => typeof item === 'function')) process.exit(1);",
      ],
      { cwd: consumerRoot },
    );
    runNpm(['run', 'typecheck'], { cwd: consumerRoot });
    runNpm(['run', 'test'], { cwd: consumerRoot });
    runNpm(['run', 'build'], { cwd: consumerRoot });

    if (process.env['FRAMEWORK_INSTALL_CHROMIUM']) {
      const installArgs = ['exec', '--', 'playwright', 'install'];
      if (process.env['FRAMEWORK_INSTALL_CHROMIUM'] === '1') installArgs.push('--with-deps');
      installArgs.push('chromium');
      runNpm(installArgs, { cwd: consumerRoot });
    }

    runNpm(['run', 'test:e2e'], { cwd: consumerRoot });
    log(
      'framework Garden consumer: independent source copy, locked toolchain, offline core+narrative archives, ESM, declarations, tests, production build, and Chromium smoke passed',
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    await checkFrameworkGardenConsumer();
  } catch (error) {
    logError(error);
    process.exitCode = 1;
  }
}
