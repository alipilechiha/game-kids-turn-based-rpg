import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE_DIR = path.join(ROOT, 'packages', 'gameplay');
const TYPESCRIPT = path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    windowsHide: true,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed (${result.status}).\n${result.stdout}\n${result.stderr}`,
    );
  }
  return result.stdout;
}

function runNpm(args, options) {
  if (process.env.npm_execpath)
    return run(process.execPath, [process.env.npm_execpath, ...args], options);
  if (process.platform === 'win32') {
    const cli = path.join(
      path.dirname(process.execPath),
      'node_modules',
      'npm',
      'bin',
      'npm-cli.js',
    );
    return run(process.execPath, [cli, ...args], options);
  }
  return run('npm', args, options);
}

const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'waypoint-gameplay-consumer-'));
try {
  const packageDist = path.join(PACKAGE_DIR, 'dist', 'index.js');
  try {
    await readFile(packageDist);
  } catch {
    throw new Error('Gameplay package is not built. Run npm run framework:build first.');
  }

  const packOutput = runNpm(
    [
      'pack',
      '--workspace=packages/gameplay',
      '--ignore-scripts',
      '--json',
      '--pack-destination',
      temporaryRoot,
    ],
    { cwd: ROOT },
  );
  const packed = JSON.parse(packOutput)[0];
  assert.ok(packed?.filename, 'npm pack did not return a tarball');
  assert.ok(!packed.files.some((file) => /(?:^|\/)(?:src|test|scripts)\//.test(file.path)));
  const tarball = path.join(temporaryRoot, packed.filename);
  const artifactOutput = process.env.GAMEPLAY_TARBALL_OUTPUT;
  if (artifactOutput) {
    const persistentOutput = path.resolve(artifactOutput);
    await mkdir(path.dirname(persistentOutput), { recursive: true });
    await copyFile(tarball, persistentOutput);
  }

  const consumer = path.join(temporaryRoot, 'consumer');
  const nodeNext = path.join(consumer, 'node-next');
  const bundler = path.join(consumer, 'bundler');
  await mkdir(nodeNext, { recursive: true });
  await mkdir(bundler, { recursive: true });
  await writeFile(
    path.join(consumer, 'package.json'),
    JSON.stringify({ name: 'installed-gameplay-consumer', private: true, type: 'module' }, null, 2),
  );
  runNpm(['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', tarball], {
    cwd: consumer,
    env: {
      ...process.env,
      npm_config_offline: 'true',
      npm_config_audit: 'false',
      npm_config_fund: 'false',
    },
  });

  await writeFile(
    path.join(consumer, 'runtime.mjs'),
    `
    import assert from 'node:assert/strict';
    import { readFile } from 'node:fs/promises';
    import {
      applyGameplayGrant,
      compileGameplay,
      createGameplayState,
      decodeGameplayState,
      encodeGameplayState,
      getCharacterLevel,
      getUnlockedAbilityIds,
    } from 'waypoint-rpg-gameplay';

    const definition = {
      schemaVersion: 1,
      id: 'tarball-gameplay',
      contentVersion: 'copy-1',
      compatibilityVersion: 'shape-1',
      movementAttributeId: 'movement',
      healthResourceId: 'health',
      inventoryCapacity: 4,
      attributes: [
        { id: 'strength', minimum: 0, maximum: 10, defaultValue: 1 },
        { id: 'movement', minimum: 1, maximum: 8, defaultValue: 2 },
      ],
      resources: [{ id: 'health', maximum: 10, defaultValue: 10 }],
      progression: {
        maxLevel: 3,
        experienceThresholds: [100, 200],
        abilityUnlocks: [{ level: 2, abilityId: 'focus' }],
      },
      characters: [
        {
          id: 'hero',
          baseAttributes: { strength: 4, movement: 3 },
          startingResources: { health: 10 },
          startingAbilityIds: ['basic'],
        },
      ],
      items: [{ id: 'herb', stackLimit: 3 }],
      equipmentSlots: [{ id: 'weapon' }],
      abilities: [
        {
          id: 'basic',
          resourceCosts: {},
          target: { kind: 'self', minimumRange: 0, maximumRange: 0 },
          effects: [{ op: 'heal', amount: 1 }],
        },
        {
          id: 'focus',
          resourceCosts: {},
          target: { kind: 'self', minimumRange: 0, maximumRange: 0 },
          effects: [{ op: 'heal', amount: 1 }],
        },
      ],
      statusEffects: [],
      boards: [],
      encounters: [],
    };

    const compiled = compileGameplay(definition);
    const state = createGameplayState(compiled, 'tarball-playthrough');
    assert.equal(getCharacterLevel(compiled, state, 'hero'), 1);
    assert.deepEqual(getUnlockedAbilityIds(compiled, state, 'hero'), ['basic']);

    const granted = applyGameplayGrant(compiled, state, {
      playthroughId: state.playthroughId,
      expectedRevision: state.revision,
      rewardId: 'starter',
      experience: [{ characterId: 'hero', amount: 100 }],
      items: [{ itemId: 'herb', quantity: 2 }],
    });
    assert.equal(granted.accepted, true);
    assert.equal(getCharacterLevel(compiled, granted.state, 'hero'), 2);
    assert.deepEqual(getUnlockedAbilityIds(compiled, granted.state, 'hero'), ['basic', 'focus']);

    const encoded = encodeGameplayState(compiled, granted.state);
    assert.equal(decodeGameplayState(compiled, JSON.parse(encoded)).ok, true);
    await assert.rejects(import('waypoint-rpg-gameplay/dist/index.js'), {
      code: 'ERR_PACKAGE_PATH_NOT_EXPORTED',
    });
    const manifest = JSON.parse(
      await readFile(new URL('./node_modules/waypoint-rpg-gameplay/package.json', import.meta.url), 'utf8'),
    );
    assert.equal(Object.keys(manifest.exports).length, 1);
    assert.deepEqual(manifest.dependencies ?? {}, {});
    console.log('installed gameplay ESM runtime and root-only export passed');
  `,
  );
  run(process.execPath, [path.join(consumer, 'runtime.mjs')], { cwd: consumer });

  const declarationImport = `
    import {
      compileGameplay,
      createGameplayState,
      type GameplayDefinition,
      type GameplayState,
    } from 'waypoint-rpg-gameplay';
    const definition: GameplayDefinition = {
      schemaVersion: 1,
      id: 'typed-gameplay',
      contentVersion: '1',
      compatibilityVersion: '1',
      movementAttributeId: 'movement',
      healthResourceId: 'health',
      inventoryCapacity: 2,
      attributes: [
        { id: 'strength', minimum: 0, maximum: 10, defaultValue: 1 },
        { id: 'movement', minimum: 1, maximum: 8, defaultValue: 2 },
      ],
      resources: [{ id: 'health', maximum: 10, defaultValue: 10 }],
      progression: { maxLevel: 1, experienceThresholds: [], abilityUnlocks: [] },
      characters: [{ id: 'hero', baseAttributes: { strength: 1, movement: 2 } }],
      items: [],
      equipmentSlots: [],
      abilities: [],
      statusEffects: [],
      boards: [],
      encounters: [],
    };
    const state: GameplayState = createGameplayState(compileGameplay(definition), 'typed-playthrough');
    void state.revision;
  `;
  await writeFile(path.join(nodeNext, 'consumer.mts'), declarationImport);
  await writeFile(
    path.join(nodeNext, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        strict: true,
        noEmit: true,
        types: [],
        skipLibCheck: false,
      },
      include: ['consumer.mts'],
    }),
  );
  await writeFile(path.join(bundler, 'consumer.ts'), declarationImport);
  await writeFile(
    path.join(bundler, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        strict: true,
        noEmit: true,
        types: [],
        skipLibCheck: false,
      },
      include: ['consumer.ts'],
    }),
  );
  run(process.execPath, [TYPESCRIPT, '--project', path.join(nodeNext, 'tsconfig.json')], {
    cwd: consumer,
  });
  run(process.execPath, [TYPESCRIPT, '--project', path.join(bundler, 'tsconfig.json')], {
    cwd: consumer,
  });
  console.log(
    `gameplay tarball consumer passed (${packed.files.length} packed files; NodeNext, Bundler, offline install)`,
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
