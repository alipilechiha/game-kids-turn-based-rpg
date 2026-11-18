import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = resolve(root, '.release-compat');
const currentDist = resolve(root, 'dist');
const baseline = process.argv[2] ?? process.env['RELEASE_BASELINE_SHA'] ?? 'origin/main';

function assertInsideRoot(path) {
  if (!path.startsWith(`${root}${sep}`)) {
    throw new Error(`Refusing to mutate a path outside the repository: ${path}`);
  }
}

assertInsideRoot(outputRoot);
if (!existsSync(join(currentDist, 'index.html'))) {
  throw new Error('dist/index.html is missing; run npm run build first.');
}

const baselineCommit = execFileSync('git', ['rev-parse', '--verify', `${baseline}^{commit}`], {
  cwd: root,
  encoding: 'utf8',
}).trim();
const archive = spawnSync(
  'git',
  [
    'archive',
    '--format=tar',
    baselineCommit,
    'src',
    'index.html',
    'vite.config.ts',
    'package.json',
    'public',
  ],
  { cwd: root, maxBuffer: 128 * 1024 * 1024 },
);
if (archive.status !== 0 || !archive.stdout) {
  throw new Error(
    archive.stderr?.toString('utf8') || `Could not archive rollback baseline ${baselineCommit}.`,
  );
}

if (existsSync(outputRoot)) rmSync(outputRoot, { recursive: true, force: true });
const oldSource = join(outputRoot, 'old-source');
const oldDist = join(oldSource, 'dist');
const candidateDist = join(outputRoot, 'candidate-dist');
mkdirSync(oldSource, { recursive: true });

const extraction = spawnSync('tar', ['-xf', '-', '-C', oldSource], {
  input: archive.stdout,
  maxBuffer: 128 * 1024 * 1024,
});
if (extraction.status !== 0) {
  throw new Error(extraction.stderr?.toString('utf8') || 'Could not extract rollback baseline.');
}

const viteCli = join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const build = spawnSync(
  process.execPath,
  [viteCli, 'build', '--config', join(oldSource, 'vite.config.ts'), '--outDir', oldDist],
  { cwd: oldSource, stdio: 'inherit', windowsHide: true },
);
if (build.status !== 0) throw new Error(`Rollback baseline Vite build failed (${build.status}).`);

cpSync(currentDist, candidateDist, { recursive: true, errorOnExist: true });
writeFileSync(
  join(outputRoot, 'manifest.json'),
  `${JSON.stringify({ baseline: baselineCommit, oldDist: 'old-source/dist', candidateDist: 'candidate-dist' }, null, 2)}\n`,
);
process.stdout.write(`Prepared same-origin rollback pair from ${baselineCommit}.\n`);
