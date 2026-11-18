import { error as logError, log } from 'node:console';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { URL, fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

export const PRODUCTION_SOURCE_FILES = [
  'src/index.ts',
  'src/identifiers.ts',
  'src/world.ts',
  'src/geometry.ts',
  'src/graph.ts',
  'src/pathfinding.ts',
  'src/runtime.ts',
  'src/persistence.ts',
];

export const PUBLIC_EXPORTS = [
  'Anchor',
  'AnchorId',
  'AreaId',
  'Bounds',
  'DiscoveryId',
  'Edge',
  'GameRuntime',
  'GameRuntimeAdapter',
  'GameRuntimeConfig',
  'GraphSource',
  'LandmarkId',
  'LoadResult',
  'MapId',
  'MapTransition',
  'NpcId',
  'NpcPlacement',
  'PathPoint',
  'PersistenceAdapter',
  'PersistenceFailure',
  'ReducerContext',
  'RuntimeListener',
  'SaveScope',
  'StorageFallback',
  'TransitionId',
  'WorldArea',
  'WorldMap',
  'anchorForLandmark',
  'anchorForNpc',
  'createGameRuntime',
  'distanceBetween',
  'findPath',
  'getAnchor',
  'getAnchorOrNull',
  'insideBounds',
  'nearestWalkableAnchor',
  'neighboursOf',
  'pathToPoints',
];

const DEFAULT_PACKAGE_SOURCES = new Set(PRODUCTION_SOURCE_FILES);

export function analyzeSourceText(
  sourceText,
  relativeFile,
  packageSources = DEFAULT_PACKAGE_SOURCES,
) {
  const normalizedFile = path.posix.normalize(relativeFile.replaceAll('\\', '/'));
  const sourceFile = ts.createSourceFile(
    normalizedFile,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const errors = [];

  const checkSpecifier = (specifier) => {
    if (
      !specifier.startsWith('./') ||
      !specifier.endsWith('.js') ||
      specifier.includes('\\') ||
      specifier.split('/').includes('..')
    ) {
      errors.push(`${normalizedFile}: disallowed module specifier "${specifier}"`);
      return;
    }

    const resolved = path.posix.normalize(
      path.posix.join(path.posix.dirname(normalizedFile), specifier),
    );
    if (!resolved.startsWith('src/') || !resolved.endsWith('.js')) {
      errors.push(`${normalizedFile}: module specifier escapes package source: "${specifier}"`);
      return;
    }

    const sourcePath = `${resolved.slice(0, -'.js'.length)}.ts`;
    if (!packageSources.has(sourcePath)) {
      errors.push(
        `${normalizedFile}: module specifier does not resolve to package source: "${specifier}"`,
      );
    }
  };

  if (
    sourceFile.referencedFiles.length > 0 ||
    sourceFile.typeReferenceDirectives.length > 0 ||
    sourceFile.libReferenceDirectives.length > 0
  ) {
    errors.push(`${normalizedFile}: triple-slash references are forbidden in production source`);
  }

  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      checkSpecifier(node.moduleSpecifier.text);
      if (ts.isExportDeclaration(node) && !node.exportClause) {
        errors.push(`${normalizedFile}: wildcard exports are forbidden`);
      }
    }

    if (ts.isImportTypeNode(node)) {
      if (ts.isLiteralTypeNode(node.argument) && ts.isStringLiteralLike(node.argument.literal)) {
        checkSpecifier(node.argument.literal.text);
      } else {
        errors.push(`${normalizedFile}: non-literal import types are forbidden`);
      }
    }

    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      errors.push(`${normalizedFile}: dynamic import is forbidden in production source`);
    }

    if (ts.isIdentifier(node) && node.text === 'require') {
      const parent = node.parent;
      const isPropertyName =
        (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
        (ts.isPropertyAssignment(parent) && parent.name === node) ||
        (ts.isMethodDeclaration(parent) && parent.name === node) ||
        (ts.isPropertyDeclaration(parent) && parent.name === node);
      if (!isPropertyName) {
        errors.push(`${normalizedFile}: CommonJS require is forbidden in production source`);
      }
    }

    if (ts.isImportEqualsDeclaration(node)) {
      errors.push(`${normalizedFile}: TypeScript import assignments are forbidden`);
    }

    if (ts.isExportAssignment(node) && node.isExportEquals) {
      errors.push(`${normalizedFile}: CommonJS export assignments are forbidden`);
    }

    if (ts.isModuleDeclaration(node) && ts.isStringLiteral(node.name)) {
      errors.push(`${normalizedFile}: ambient external modules are forbidden`);
    }

    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      let assignmentRoot = node.left;
      while (
        ts.isPropertyAccessExpression(assignmentRoot) ||
        ts.isElementAccessExpression(assignmentRoot)
      ) {
        assignmentRoot = assignmentRoot.expression;
      }
      if (ts.isIdentifier(assignmentRoot) && ['module', 'exports'].includes(assignmentRoot.text)) {
        errors.push(`${normalizedFile}: CommonJS exports are forbidden in production source`);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return errors;
}

export function validateManifest(manifest) {
  const errors = [];
  if (manifest.name !== 'waypoint-rpg-core') errors.push('manifest name must be waypoint-rpg-core');
  if (manifest.version !== '0.1.0') errors.push('package version must be 0.1.0');
  if (manifest.license !== 'MIT') errors.push('package license must be MIT');
  if (manifest.private !== true) errors.push('package must remain private in Phase 1');
  if (manifest.type !== 'module') errors.push('package type must be module');
  if (manifest.sideEffects !== false) errors.push('sideEffects must be false');
  if (manifest.engines?.node !== '>=22.0.0') errors.push('Node runtime engine must be >=22.0.0');
  const expectedDevDependencies = { typescript: '6.0.3' };
  if (
    !manifest.devDependencies ||
    Object.keys(manifest.devDependencies).sort().join('\0') !==
      Object.keys(expectedDevDependencies).sort().join('\0') ||
    manifest.devDependencies.typescript !== expectedDevDependencies.typescript
  ) {
    errors.push('development dependency inventory must contain only TypeScript 6.0.3');
  }

  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    if (manifest[field] && Object.keys(manifest[field]).length > 0) {
      errors.push(`${field} must be empty`);
    }
  }
  for (const field of ['bundledDependencies', 'bundleDependencies']) {
    const value = manifest[field];
    const hasBundledDependencies =
      value === true ||
      (Array.isArray(value) && value.length > 0) ||
      (value !== null && typeof value === 'object' && Object.keys(value).length > 0) ||
      (value !== undefined && value !== null && typeof value !== 'object' && value !== false);
    if (hasBundledDependencies) errors.push(`${field} must be empty`);
  }

  const exports = manifest.exports;
  if (!exports || Object.keys(exports).length !== 1 || !Object.hasOwn(exports, '.')) {
    errors.push('package must declare only the root export');
  } else {
    const conditions = exports['.'];
    if (
      !conditions ||
      Object.keys(conditions).sort().join('\0') !== ['import', 'types'].join('\0')
    ) {
      errors.push('root export conditions must contain only types and import');
    } else if (
      conditions.types !== './dist/index.d.ts' ||
      conditions.import !== './dist/index.js'
    ) {
      errors.push('root export must resolve ESM and declarations from dist');
    }
  }

  const expectedFiles = ['dist', 'README.md', 'LICENSE'];
  if (
    !Array.isArray(manifest.files) ||
    [...manifest.files].sort().join('\0') !== [...expectedFiles].sort().join('\0')
  ) {
    errors.push('packed files must be limited to dist, README.md, and LICENSE');
  }

  return errors;
}

export function declaredExportNames(sourceText) {
  const sourceFile = ts.createSourceFile(
    'index.ts',
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const names = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isExportDeclaration(statement) || !statement.exportClause) continue;
    if (!ts.isNamedExports(statement.exportClause)) continue;
    for (const element of statement.exportClause.elements) names.push(element.name.text);
  }

  return names.sort();
}

async function listFiles(root) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(fullPath)));
    else if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

async function checkPackage() {
  const packageRoot = fileURLToPath(new URL('../', import.meta.url));
  const sourceRoot = path.join(packageRoot, 'src');
  const manifest = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
  const errors = validateManifest(manifest);
  const allSourceFiles = await listFiles(sourceRoot);
  const relativeAllFiles = allSourceFiles.map((file) =>
    path.relative(packageRoot, file).replaceAll('\\', '/'),
  );
  const sourceFiles = allSourceFiles.filter((file) => file.endsWith('.ts'));
  const relativeFiles = sourceFiles.map((file) =>
    path.relative(packageRoot, file).replaceAll('\\', '/'),
  );

  if ([...relativeAllFiles].sort().join('\0') !== [...PRODUCTION_SOURCE_FILES].sort().join('\0')) {
    errors.push(
      `production source inventory differs from the approved module set: ${relativeAllFiles.join(', ')}`,
    );
  }

  const sourceSet = new Set(relativeFiles);
  for (const file of sourceFiles) {
    const relativeFile = path.relative(packageRoot, file).replaceAll('\\', '/');
    errors.push(...analyzeSourceText(await readFile(file, 'utf8'), relativeFile, sourceSet));
  }

  const entryPath = path.join(sourceRoot, 'index.ts');
  const exports = declaredExportNames(await readFile(entryPath, 'utf8'));
  if (exports.join('\0') !== [...PUBLIC_EXPORTS].sort().join('\0')) {
    errors.push(`public exports differ from the approved API: ${exports.join(', ')}`);
  }

  if (errors.length > 0) {
    for (const message of errors) logError(`framework boundary: ${message}`);
    process.exitCode = 1;
  } else {
    log(
      `framework boundary: ${relativeFiles.length} source files, root-only API, no runtime dependencies`,
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await checkPackage();
}
