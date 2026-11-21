import assert from 'node:assert/strict';
import { error as logError, log } from 'node:console';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { URL, fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

export async function buildPackageCopyOutsideRepository() {
  const packageRoot = fileURLToPath(new URL('../', import.meta.url));
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'waypoint-rpg-core-build-'));
  try {
    const sourceRoot = path.join(temporaryRoot, 'src');
    const configPath = path.join(temporaryRoot, 'tsconfig.build.json');
    const outputRoot = path.join(temporaryRoot, 'dist');
    await cp(path.join(packageRoot, 'src'), sourceRoot, { recursive: true });
    await cp(path.join(packageRoot, 'tsconfig.build.json'), configPath);
    await cp(path.join(packageRoot, 'package.json'), path.join(temporaryRoot, 'package.json'));

    const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
    assert.equal(configFile.error, undefined, 'isolated build config must be readable');
    const parsed = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      temporaryRoot,
      { outDir: outputRoot },
      configPath,
    );
    const program = ts.createProgram(parsed.fileNames, parsed.options);
    const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)];
    const emitted = program.emit();
    diagnostics.push(...emitted.diagnostics);

    if (diagnostics.length > 0) {
      throw new Error(
        ts.formatDiagnosticsWithColorAndContext(diagnostics, {
          getCurrentDirectory: ts.sys.getCurrentDirectory,
          getCanonicalFileName: (fileName) => fileName,
          getNewLine: () => ts.sys.newLine,
        }),
      );
    }

    await readFile(path.join(outputRoot, 'index.js'), 'utf8');
    await readFile(path.join(outputRoot, 'index.d.ts'), 'utf8');
    return { temporaryRoot, outputRoot };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    await buildPackageCopyOutsideRepository();
    log('framework isolated build: emitted ESM and declarations outside the repository');
  } catch (error) {
    logError(error);
    process.exitCode = 1;
  }
}
