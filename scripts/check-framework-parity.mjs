import { error as logError, log } from 'node:console';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { URL, fileURLToPath, pathToFileURL } from 'node:url';

export const FRAMEWORK_MODULES = [
  'identifiers',
  'world',
  'geometry',
  'graph',
  'pathfinding',
  'runtime',
  'persistence',
];

export function normalizeFrameworkSource(source) {
  return source
    .replaceAll('\r\n', '\n')
    .replace(/(["'](?:\.\/|\.\.\/)[^"']+)\.ts(["'])/g, '$1.js$2');
}

export async function checkFrameworkParity(
  repoRoot = fileURLToPath(new URL('../', import.meta.url)),
) {
  const errors = [];
  for (const moduleName of FRAMEWORK_MODULES) {
    const appPath = path.join(repoRoot, 'src', 'framework', 'core', `${moduleName}.ts`);
    const packagePath = path.join(repoRoot, 'packages', 'core', 'src', `${moduleName}.ts`);
    const [appSource, packageSource] = await Promise.all([
      readFile(appPath, 'utf8'),
      readFile(packagePath, 'utf8'),
    ]);
    if (normalizeFrameworkSource(appSource) !== normalizeFrameworkSource(packageSource)) {
      errors.push(
        `${moduleName}.ts differs from the app source after line-ending/import-suffix normalization`,
      );
    }
  }
  return errors;
}

async function main() {
  const errors = await checkFrameworkParity();
  if (errors.length > 0) {
    for (const message of errors) logError(`framework parity: ${message}`);
    process.exitCode = 1;
  } else {
    log(`framework parity: ${FRAMEWORK_MODULES.length} source modules match`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
