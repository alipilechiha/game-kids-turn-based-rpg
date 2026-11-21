import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, lstat, readFile, rm, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const coreRoot = resolve(root, 'packages/core');
const narrativeRoot = resolve(root, 'packages/narrative');
const graphSource = resolve(coreRoot, 'src/graph.ts');
const graphOutput = resolve(coreRoot, 'dist/graph.js');
const narrativeStateSource = resolve(narrativeRoot, 'src/state.ts');
const narrativeStateOutput = resolve(narrativeRoot, 'dist/state.js');
const distRoots = [resolve(coreRoot, 'dist'), resolve(narrativeRoot, 'dist')];
const tsc = resolve(root, 'node_modules/typescript/bin/tsc');
const devLinked = resolve(root, 'scripts/dev-linked.mjs');
const fixtureHtml = resolve(root, 'framework-watch-probe.html');
const fixtureTs = resolve(root, 'framework-watch-probe.ts');
const html = `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><title>Core watch probe</title></head>
<body><output id="result">loading</output><script type="module" src="./framework-watch-probe.ts"></script></body></html>`;
const consumer = `import { getAnchor } from 'waypoint-rpg-core';
import { compileNarrative, createNarrativeState, getDialogueView, transitionNarrative } from 'waypoint-rpg-narrative';
try {
  getAnchor({ anchors: [], edges: [] }, 'watch-probe' as never);
} catch (error) {
  const compiled = compileNarrative({
    schemaVersion: 1, id: 'linked-watch-story', contentVersion: '1', compatibilityVersion: '1',
    entryDialogueId: 'entry', quests: [],
    dialogues: [{ id: 'entry', entryNodeId: 'question', exitPolicy: 'allowed', nodes: [
      { id: 'question', speakerId: 'watch', text: { en: 'Initial narrative watch text' }, terminal: true, endingId: 'end' }
    ] }]
  });
  const fresh = createNarrativeState(compiled, 'watch-playthrough');
  const opened = transitionNarrative(compiled, fresh, {
    type: 'open-dialogue', dialogueId: 'entry', playthroughId: fresh.playthroughId, expectedRevision: fresh.revision
  });
  const dialogue = opened.accepted ? getDialogueView(compiled, opened.state, 'xx') : null;
  document.querySelector('output').textContent = (error instanceof Error ? error.message : String(error)) + '|' + (dialogue?.text ?? 'narrative failed');
}`;

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

async function assertAbsent(path) {
  try {
    await access(path);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  throw new Error(`Refusing to overwrite existing probe file: ${path}`);
}

async function freePort() {
  const listener = createServer();
  await new Promise((resolveListen) => listener.listen(0, '127.0.0.1', resolveListen));
  const address = listener.address();
  if (!address || typeof address === 'string') throw new Error('Could not allocate a local port.');
  await new Promise((resolveClose, reject) =>
    listener.close((error) => (error ? reject(error) : resolveClose())),
  );
  return address.port;
}

function startServer(port) {
  const child = spawn(
    process.execPath,
    [devLinked, '--port', String(port), '--host', '127.0.0.1', '--strictPort'],
    {
      cwd: root,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );
  const session = { child, log: '' };
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      session.log += chunk;
      process.stdout.write(chunk);
    });
  }
  return session;
}

async function stopServer(session) {
  if (!session || session.child.exitCode !== null) return;
  const { child } = session;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
  } else {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      child.kill('SIGTERM');
    }
  }
  await Promise.race([once(child, 'exit'), delay(5000)]);
  if (child.exitCode === null) {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
    } else {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    }
    await Promise.race([once(child, 'exit'), delay(1000)]);
  }
}

async function waitFor(check, description, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${description}.`);
}

async function waitForServer(session, url) {
  await waitFor(
    async () => {
      if (session.child.exitCode !== null) {
        throw new Error(`Linked development process exited early:\n${session.log}`);
      }
      try {
        const response = await fetch(url);
        return response.ok;
      } catch {
        return false;
      }
    },
    'Vite to serve the framework watch probe',
    120_000,
  );
  const compilerReady = session.log.indexOf(
    'Core and narrative packages are built; starting Vite with default resolution.',
  );
  const viteReady = session.log.indexOf('ready in');
  assert(compilerReady >= 0 && viteReady > compilerReady, 'Vite started before the package build.');
}

async function waitForText(page, expected) {
  await page.waitForFunction(
    (text) => globalThis.document.querySelector('output')?.textContent === text,
    expected,
    { timeout: 30_000 },
  );
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

let originalGraph;
let originalNarrativeState;
let browser;
let server;
let fixtureCreated = false;
let port;
const appUrl = () => `http://127.0.0.1:${port}/framework-watch-probe.html`;

try {
  await assertAbsent(fixtureHtml);
  await assertAbsent(fixtureTs);
  originalGraph = await readFile(graphSource, 'utf8');

  const watchText = originalGraph.replace(
    'throw new Error(`Unknown anchor: ${id}`);',
    'throw new Error(`Framework watch update: ${id}`);',
  );
  assert(watchText !== originalGraph, 'Could not find the graph diagnostic for the watch probe.');
  const brokenGraph = watchText.replace(
    'const anchor = anchorsById(source.anchors).get(id);',
    'const anchor: number = anchorsById(source.anchors).get(id);',
  );
  assert(brokenGraph !== watchText, 'Could not find the graph lookup for the compile-error probe.');
  originalNarrativeState = await readFile(narrativeStateSource, 'utf8');
  const watchNarrativeState = originalNarrativeState.replace(
    "return fallback ? values[fallback]! : '';",
    "return fallback ? `Narrative watch update: ${values[fallback]!}` : '';",
  );
  assert(
    watchNarrativeState !== originalNarrativeState,
    'Could not find localized text fallback for the narrative watch probe.',
  );
  const brokenNarrativeState = watchNarrativeState.replace(
    "return fallback ? `Narrative watch update: ${values[fallback]!}` : '';",
    "const invalidNarrativeWatchValue: number = 'invalid';\n  void invalidNarrativeWatchValue;\n  return fallback ? `Narrative watch update: ${values[fallback]!}` : '';",
  );
  assert(
    brokenNarrativeState !== watchNarrativeState,
    'Could not construct the narrative TypeScript error probe.',
  );

  for (const distRoot of distRoots) {
    const distEntry = await lstat(distRoot).catch((error) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    assert(!distEntry?.isSymbolicLink(), 'Refusing to clear a linked package dist directory.');
    assert(
      [resolve(coreRoot, 'dist'), resolve(narrativeRoot, 'dist')].includes(distRoot),
      'Package output path escaped its framework package.',
    );
    await rm(distRoot, { recursive: true, force: true });
  }
  fixtureCreated = true;
  await writeFile(fixtureHtml, html);
  await writeFile(fixtureTs, consumer);

  port = await freePort();
  server = startServer(port);
  await waitForServer(server, appUrl());

  browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  let loads = 0;
  const moduleResponses = [];
  page.on('load', () => (loads += 1));
  page.on('response', (response) => {
    if (/(?:graph|state)\.js(?:\?|$)/.test(response.url())) moduleResponses.push(response.url());
  });
  await page.goto(appUrl());
  const originalOutput = 'Unknown anchor: watch-probe|Initial narrative watch text';
  const updatedOutput =
    'Framework watch update: watch-probe|Narrative watch update: Initial narrative watch text';
  await waitForText(page, originalOutput);
  const initialLoads = loads;

  await Promise.all([
    writeFile(graphSource, watchText),
    writeFile(narrativeStateSource, watchNarrativeState),
  ]);
  await waitForText(page, updatedOutput);
  await waitFor(
    () => loads > initialLoads,
    'the browser page to reload after a linked package edit',
  );
  const lastGoodOutput = await readFile(graphOutput);
  const lastGoodNarrativeOutput = await readFile(narrativeStateOutput);
  assert(
    lastGoodOutput.includes('Framework watch update:'),
    'The package compiler did not emit the edit.',
  );
  assert(
    moduleResponses.some((url) => url.includes('graph.js')) &&
      moduleResponses.some((url) => url.includes('state.js')),
    'Chromium did not load both linked framework package modules.',
  );

  const lastGoodHash = sha256(lastGoodOutput);
  const lastGoodNarrativeHash = sha256(lastGoodNarrativeOutput);
  const lastGoodLoads = loads;
  const errorOffset = server.log.length;
  await writeFile(narrativeStateSource, brokenNarrativeState);
  await waitFor(
    () => /error TS2322/.test(server.log.slice(errorOffset)),
    'the expected narrative TypeScript watch error',
  );
  assert(
    sha256(await readFile(graphOutput)) === lastGoodHash &&
      sha256(await readFile(narrativeStateOutput)) === lastGoodNarrativeHash,
    'noEmitOnError did not preserve both last successful package outputs.',
  );
  assert(
    (await page.locator('output').textContent()) === updatedOutput && loads === lastGoodLoads,
    'The browser changed after a failed package compilation.',
  );

  await Promise.all([
    writeFile(graphSource, originalGraph),
    writeFile(narrativeStateSource, originalNarrativeState),
  ]);
  await waitForText(page, originalOutput);
  await waitFor(() => loads > lastGoodLoads, 'the browser to recover after a valid source edit');
  assert(
    (await readFile(graphOutput, 'utf8')).includes('Unknown anchor: ${id}'),
    'The package compiler did not restore the original output.',
  );
  assert(
    (await readFile(narrativeStateOutput, 'utf8')).includes(
      "return fallback ? values[fallback] : '';",
    ),
    'The narrative package compiler did not restore the original output.',
  );

  await browser.close();
  browser = undefined;
  await stopServer(server);
  server = undefined;

  server = startServer(port);
  await waitForServer(server, appUrl());
  browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
  const warmPage = await browser.newPage();
  await warmPage.goto(appUrl());
  await waitForText(warmPage, originalOutput);
  process.stdout.write(
    'Linked framework development passed cold/warm, default Vite resolution, dual-package update, error-preservation, and recovery checks.\n',
  );
} finally {
  if (browser) await browser.close();
  await stopServer(server);
  if (originalGraph !== undefined) await writeFile(graphSource, originalGraph);
  if (originalNarrativeState !== undefined)
    await writeFile(narrativeStateSource, originalNarrativeState);
  if (fixtureCreated) {
    await rm(fixtureHtml, { force: true });
    await rm(fixtureTs, { force: true });
  }

  for (const project of [
    'packages/core/tsconfig.build.json',
    'packages/narrative/tsconfig.build.json',
  ]) {
    const build = spawnSync(process.execPath, [tsc, '--project', project], {
      cwd: root,
      stdio: 'inherit',
      windowsHide: true,
    });
    assert(build.status === 0, `Could not restore ${project} after the watch check.`);
  }
}
