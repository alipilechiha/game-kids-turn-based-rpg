import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const tsc = resolve(root, 'node_modules/typescript/bin/tsc');
const vite = resolve(root, 'node_modules/vite/bin/vite.js');
const packageProjects = [
  { name: 'core', path: 'packages/core/tsconfig.build.json' },
  { name: 'narrative', path: 'packages/narrative/tsconfig.build.json' },
];
const viteArgs = process.argv.slice(2);
const compilers = packageProjects.map(({ path }) =>
  spawn(process.execPath, [tsc, '--project', path, '--watch', '--pretty', 'false'], {
    cwd: root,
    stdio: ['inherit', 'pipe', 'pipe'],
    windowsHide: true,
  }),
);

const readyPackages = new Set();
let stopping = false;
let server;
let resolveServer;
let resolveReady;
let rejectReady;
let readyTimer;
const serverExit = new Promise((resolveExit) => {
  resolveServer = resolveExit;
});
const ready = new Promise((resolvePromise, rejectPromise) => {
  resolveReady = resolvePromise;
  rejectReady = rejectPromise;
  readyTimer = setTimeout(
    () => rejectReady(new Error('Timed out waiting for both framework packages to build.')),
    120_000,
  );
});

function stop(child) {
  if (child && child.exitCode === null && !child.killed) child.kill();
}

function stopCompilers() {
  for (const compiler of compilers) stop(compiler);
}

function shutdown() {
  stopping = true;
  clearTimeout(readyTimer);
  stop(server);
  stopCompilers();
  resolveServer(0);
}

for (const [index, compiler] of compilers.entries()) {
  const { name } = packageProjects[index];
  compiler.once('error', (error) => rejectReady(error));
  compiler.once('exit', (code) => {
    if (stopping) return;
    if (!readyPackages.has(name)) {
      rejectReady(
        new Error(`${name} compiler exited before its first successful build (${code}).`),
      );
    } else {
      process.stderr.write(`Framework ${name} compiler exited while Vite was running (${code}).\n`);
      stopping = true;
      stop(server);
      stopCompilers();
      resolveServer(code ?? 1);
    }
  });

  const lines = createInterface({ input: compiler.stdout });
  lines.on('line', (line) => {
    process.stdout.write(`[${name}] ${line}\n`);
    const result = /Found (\d+) errors?\./.exec(line);
    if (!result) return;
    if (Number(result[1]) !== 0) {
      rejectReady(
        new Error(`Framework ${name} package has TypeScript errors; Vite was not started.`),
      );
      return;
    }
    readyPackages.add(name);
    if (readyPackages.size === packageProjects.length) {
      clearTimeout(readyTimer);
      resolveReady();
    }
  });

  compiler.stderr.on('data', (chunk) => process.stderr.write(`[${name}] ${chunk}`));
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

try {
  await ready;
  if (stopping) {
    process.exitCode = 0;
  } else {
    process.stdout.write(
      'Core and narrative packages are built; starting Vite with default resolution.\n',
    );
    server = spawn(process.execPath, [vite, ...viteArgs], {
      cwd: root,
      stdio: 'inherit',
      windowsHide: true,
    });

    server.once('error', (error) => {
      process.stderr.write(`${error.message}\n`);
      stopCompilers();
      resolveServer(1);
    });
    server.once('exit', (code) => {
      if (!stopping) stopCompilers();
      resolveServer(code ?? 1);
    });

    process.exitCode = await serverExit;
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  stopping = true;
  stop(server);
  stopCompilers();
  process.exitCode = stopping ? 0 : 1;
}
