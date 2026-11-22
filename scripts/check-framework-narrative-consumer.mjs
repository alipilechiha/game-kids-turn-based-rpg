import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE_DIR = path.join(ROOT, 'packages', 'narrative');
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

const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'waypoint-narrative-consumer-'));
try {
  const packageDist = path.join(PACKAGE_DIR, 'dist', 'index.js');
  try {
    await readFile(packageDist);
  } catch {
    throw new Error('Narrative package is not built. Run npm run framework:build first.');
  }

  const packOutput = runNpm(
    [
      'pack',
      '--workspace=packages/narrative',
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
  const artifactOutput = process.env.NARRATIVE_TARBALL_OUTPUT;
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
    JSON.stringify(
      { name: 'installed-narrative-consumer', private: true, type: 'module' },
      null,
      2,
    ),
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
    import { compileNarrative, createNarrativeState, decodeNarrativeState, transitionNarrative } from 'waypoint-rpg-narrative';
    const definition = {
      schemaVersion: 1, id: 'tarball-story', contentVersion: 'copy-1', compatibilityVersion: 'shape-1',
      entryDialogueId: 'intro', quests: [],
      dialogues: [{ id: 'intro', entryNodeId: 'end', exitPolicy: 'allowed', nodes: [
        { id: 'end', speakerId: 'guide', text: { fa: 'پایان' }, terminal: true, endingId: 'end' }
      ] }]
    };
    const compiled = compileNarrative(definition);
    const state = createNarrativeState(compiled, 'tarball-playthrough');
    const opened = transitionNarrative(compiled, state, { type: 'open-dialogue', dialogueId: 'intro', playthroughId: state.playthroughId, expectedRevision: state.revision });
    assert.equal(opened.accepted, true);
    const finished = transitionNarrative(compiled, opened.state, { type: 'finish', playthroughId: state.playthroughId, expectedRevision: opened.state.revision });
    assert.equal(finished.accepted, true);
    assert.equal(finished.state.endingId, 'end');
    assert.equal(decodeNarrativeState(compiled, JSON.parse(JSON.stringify(finished.state))).ok, true);
    await assert.rejects(import('waypoint-rpg-narrative/dist/index.js'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
    const manifest = JSON.parse(await readFile(new URL('./node_modules/waypoint-rpg-narrative/package.json', import.meta.url), 'utf8'));
    assert.equal(Object.keys(manifest.exports).length, 1);
    assert.deepEqual(manifest.dependencies ?? {}, {});
    console.log('installed narrative ESM runtime and root-only export passed');
  `,
  );
  run(process.execPath, [path.join(consumer, 'runtime.mjs')], { cwd: consumer });

  const declarationImport = `
    import { compileNarrative, createNarrativeState, transitionNarrative, type NarrativeDefinition, type NarrativeState } from 'waypoint-rpg-narrative';
    const definition: NarrativeDefinition = {
      schemaVersion: 1, id: 'typed-story', contentVersion: '1', compatibilityVersion: '1', entryDialogueId: 'start', quests: [],
      dialogues: [{ id: 'start', entryNodeId: 'end', exitPolicy: 'allowed', nodes: [{ id: 'end', speakerId: 'guide', text: { en: 'End' }, terminal: true, endingId: 'end' }] }],
    };
    const state: NarrativeState = createNarrativeState(compileNarrative(definition), 'typed-playthrough');
    transitionNarrative(compileNarrative(definition), state, { type: 'finish', playthroughId: state.playthroughId, expectedRevision: state.revision });
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
    `narrative tarball consumer passed (${packed.files.length} packed files; NodeNext, Bundler, offline install)`,
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
