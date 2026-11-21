import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const tsc = resolve(root, 'node_modules/typescript/bin/tsc');
const vite = resolve(root, 'node_modules/vite/bin/vite.js');
const viteArgs = process.argv.slice(2);

const compiler = spawn(
  process.execPath,
  [tsc, '--project', 'packages/core/tsconfig.build.json', '--watch', '--pretty', 'false'],
  { cwd: root, stdio: ['inherit', 'pipe', 'pipe'] },
);

let compilerReady = false;
let stopping = false;
let server;
let resolveServer;
let readyTimer;
const serverExit = new Promise((resolveExit) => {
  resolveServer = resolveExit;
});
const ready = new Promise((resolveReady, reject) => {
  const fail = (error) => {
    clearTimeout(readyTimer);
    reject(error);
  };
  readyTimer = setTimeout(
    () => fail(new Error('Timed out waiting for the framework package first successful build.')),
    120_000,
  );

  compiler.once('error', fail);
  compiler.once('exit', (code) => {
    if (!compilerReady) {
      fail(new Error(`Framework compiler exited before its first successful build (${code}).`));
    }
  });

  const lines = createInterface({ input: compiler.stdout });
  lines.on('line', (line) => {
    process.stdout.write(`${line}\n`);
    const result = /Found (\d+) errors?\./.exec(line);
    if (!compilerReady && result) {
      if (Number(result[1]) !== 0) {
        fail(new Error('Framework package has TypeScript errors; Vite was not started.'));
        return;
      }
      compilerReady = true;
      clearTimeout(readyTimer);
      resolveReady();
    }
  });

  compiler.stderr.on('data', (chunk) => process.stderr.write(chunk));
});

function stop(child) {
  if (child && child.exitCode === null && !child.killed) child.kill();
}

function shutdown() {
  stopping = true;
  stop(server);
  stop(compiler);
  resolveServer(0);
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

try {
  await ready;
  if (stopping) {
    process.exitCode = 0;
  } else {
    process.stdout.write('Framework package is built; starting Vite with default resolution.\n');
    server = spawn(process.execPath, [vite, ...viteArgs], {
      cwd: root,
      stdio: 'inherit',
    });

    server.once('error', (error) => {
      process.stderr.write(`${error.message}\n`);
      stop(compiler);
      resolveServer(1);
    });
    server.once('exit', (code) => {
      if (!stopping) stop(compiler);
      resolveServer(code ?? 1);
    });
    compiler.once('exit', (code) => {
      if (compilerReady && !stopping) {
        process.stderr.write(`Framework compiler exited while Vite was running (${code}).\n`);
        stop(server);
        resolveServer(code ?? 1);
      }
    });

    process.exitCode = await serverExit;
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  stop(server);
  stop(compiler);
  process.exitCode = stopping ? 0 : 1;
}
