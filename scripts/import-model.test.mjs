import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { NodeIO } from '@gltf-transform/core';
import { importModel } from './import-model.mjs';
import { validateModelAssetRecord } from '../examples/scene-demo/src/animation/contracts.ts';

const repositoryRoot = resolve(import.meta.dirname, '..');
const fixtureDirectory = join(repositoryRoot, 'examples/scene-demo/fixtures/model-source');
const fixture = (name) => join(fixtureDirectory, name);

async function withTempDirectory(run) {
  const directory = await mkdtemp(join(tmpdir(), 'waypoint-model-import-'));
  try {
    await run(directory);
  } finally {
    // Windows can report ENOTEMPTY while a just-written fixture is still
    // being observed by the filesystem. Retry the recursive cleanup rather
    // than making the importer suite intermittently fail after valid output.
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

function destinations(directory) {
  return {
    outputDirectory: join(directory, 'models'),
    manifestPath: join(directory, 'asset-records.json'),
  };
}

async function writeMetadata(directory, name, value) {
  const path = join(directory, name);
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
  return path;
}

test('imports a self-contained textured static GLB and records verifiable provenance', async () => {
  await withTempDirectory(async (directory) => {
    const result = await importModel({
      sourcePath: fixture('static-textured.glb'),
      metadataPath: fixture('static-textured.asset.json'),
      ...destinations(directory),
    });
    assert.deepEqual(validateModelAssetRecord(result.record), []);
    assert.equal(result.record.metrics.textureCount, 1);
    assert.equal(result.record.materialNames.length, 1);
    assert.equal(result.record.metrics.jointCount, 0);
    assert.equal(result.record.runtimeFormat, 'glb');
    assert.equal(result.record.runtimePath, 'models/phase5-textured-static.glb');
    assert.equal(
      await readFile(result.outputPath).then((bytes) => bytes.length),
      result.record.metrics.outputBytes,
    );
  });
});

test('preserves skin weights and named animation clips in the release GLB', async () => {
  await withTempDirectory(async (directory) => {
    const result = await importModel({
      sourcePath: fixture('rigged-animated.glb'),
      metadataPath: fixture('rigged-animated.asset.json'),
      ...destinations(directory),
    });
    assert.deepEqual(validateModelAssetRecord(result.record), []);
    assert.equal(result.record.metrics.jointCount, 2);
    assert.equal(result.record.metrics.skinCount, 1);
    assert.deepEqual(
      result.record.clipInventory.map((clip) => clip.name),
      ['idle', 'move', 'interact', 'combat'],
    );
    const output = await new NodeIO().read(result.outputPath);
    assert.equal(output.getRoot().listSkins()[0]?.listJoints().length, 2);
    assert.equal(output.getRoot().listAnimations().length, 4);
    assert.ok(output.getRoot().listMeshes()[0]?.listPrimitives()[0]?.getAttribute('WEIGHTS_0'));
  });
});

test('assigns a stable runtime name to an unnamed external rigged-model clip', async () => {
  await withTempDirectory(async (directory) => {
    const result = await importModel({
      sourcePath: join(fixtureDirectory, 'khronos/RiggedFigure.glb'),
      metadataPath: join(fixtureDirectory, 'khronos/rigged-figure.asset.json'),
      ...destinations(directory),
    });
    const output = await new NodeIO().read(result.outputPath);
    assert.deepEqual(
      result.record.clipInventory.map((clip) => clip.name),
      ['clip-1'],
    );
    assert.equal(result.record.clips.idle, 'clip-1');
    assert.equal(output.getRoot().listAnimations()[0]?.getName(), 'clip-1');
    assert.equal(output.getRoot().listSkins().length, 1);
    assert.equal(output.getRoot().listAnimations()[0]?.listChannels().length, 57);
  });
});

test('repeated imports produce the same release hash and canonical manifest', async () => {
  await withTempDirectory(async (directory) => {
    const options = {
      sourcePath: fixture('rigged-animated.glb'),
      metadataPath: fixture('rigged-animated.asset.json'),
      ...destinations(directory),
    };
    const first = await importModel(options);
    const firstManifest = await readFile(first.manifestPath, 'utf8');
    const second = await importModel(options);
    assert.equal(second.record.outputSha256, first.record.outputSha256);
    assert.equal(await readFile(second.manifestPath, 'utf8'), firstManifest);
  });
});

test('converts a glTF source with local dependencies to a self-contained GLB', async () => {
  await withTempDirectory(async (directory) => {
    const io = new NodeIO();
    const source = await io.read(fixture('static-textured.glb'));
    const gltfPath = join(directory, 'local-source.gltf');
    await io.write(gltfPath, source);
    const result = await importModel({
      sourcePath: gltfPath,
      metadataPath: fixture('static-textured.asset.json'),
      ...destinations(join(directory, 'build')),
    });
    assert.equal(result.record.sourceFormat, 'gltf');
    assert.equal(result.record.runtimeFormat, 'glb');
    assert.equal(result.record.metrics.textureCount, 1);
    const output = await new NodeIO().read(result.outputPath);
    assert.equal(output.getRoot().listTextures().length, 1);
    assert.equal(output.getRoot().listBuffers().length, 1);
  });
});

test('rejects unsafe resource paths, remote imports, unsupported extensions, and bad rights', async () => {
  await withTempDirectory(async (directory) => {
    const output = destinations(directory);
    const traversal = join(directory, 'traversal.gltf');
    await writeFile(
      traversal,
      JSON.stringify({
        asset: { version: '2.0' },
        buffers: [{ uri: '../outside.bin', byteLength: 4 }],
      }),
    );
    await assert.rejects(
      importModel({
        sourcePath: traversal,
        metadataPath: fixture('static-textured.asset.json'),
        ...output,
      }),
      /escapes the source folder/,
    );

    const remote = join(directory, 'remote.gltf');
    await writeFile(
      remote,
      JSON.stringify({
        asset: { version: '2.0' },
        buffers: [{ uri: 'https://example.invalid/model.bin', byteLength: 4 }],
      }),
    );
    await assert.rejects(
      importModel({
        sourcePath: remote,
        metadataPath: fixture('static-textured.asset.json'),
        ...output,
      }),
      /external, absolute, or backslash/,
    );

    const missingResource = join(directory, 'missing.gltf');
    await writeFile(
      missingResource,
      JSON.stringify({
        asset: { version: '2.0' },
        buffers: [{ uri: 'missing.bin', byteLength: 4 }],
      }),
    );
    await assert.rejects(
      importModel({
        sourcePath: missingResource,
        metadataPath: fixture('static-textured.asset.json'),
        ...output,
      }),
      /referenced local resource does not exist/,
    );

    const extension = join(directory, 'extension.gltf');
    await writeFile(
      extension,
      JSON.stringify({ asset: { version: '2.0' }, extensionsRequired: ['EXT_unreviewed_runtime'] }),
    );
    await assert.rejects(
      importModel({
        sourcePath: extension,
        metadataPath: fixture('static-textured.asset.json'),
        ...output,
      }),
      /unsupported glTF extension/,
    );

    const metadata = JSON.parse(await readFile(fixture('static-textured.asset.json'), 'utf8'));
    metadata.rights.licenseId = 'unknown';
    const metadataPath = await writeMetadata(directory, 'unlicensed.json', metadata);
    await assert.rejects(
      importModel({ sourcePath: fixture('static-textured.glb'), metadataPath, ...output }),
      /explicit, reviewed license ID/,
    );
  });
});

test('rejects malformed GLB containers and files beyond the configured byte budget', async () => {
  await withTempDirectory(async (directory) => {
    const malformed = join(directory, 'bad.glb');
    await writeFile(malformed, Buffer.from('not a glb'));
    const output = destinations(directory);
    await assert.rejects(
      importModel({
        sourcePath: malformed,
        metadataPath: fixture('static-textured.asset.json'),
        ...output,
      }),
      /invalid GLB header/,
    );
    await assert.rejects(
      importModel({
        sourcePath: fixture('static-textured.glb'),
        metadataPath: fixture('static-textured.asset.json'),
        ...output,
        budget: { maxFileBytes: 100 },
      }),
      /source is .* limit is 100/,
    );
  });
});

test('rejects over-budget geometry and textures before creating release records', async () => {
  await withTempDirectory(async (directory) => {
    const common = {
      sourcePath: fixture('static-textured.glb'),
      metadataPath: fixture('static-textured.asset.json'),
      ...destinations(directory),
    };
    await assert.rejects(
      importModel({ ...common, budget: { maxTriangles: 11 } }),
      /12 triangles exceed the limit 11/,
    );
    await assert.rejects(
      importModel({ ...common, budget: { maxTextureDimension: 4 } }),
      /texture .* exceeds 4px/,
    );
    await assert.rejects(
      readFile(common.manifestPath),
      /ENOENT/,
      'invalid model imports must not write a release manifest',
    );
  });
});

test('rejects invalid skin joint indices before producing a release model', async () => {
  await withTempDirectory(async (directory) => {
    const io = new NodeIO();
    const document = await io.read(fixture('rigged-animated.glb'));
    const joints = document
      .getRoot()
      .listMeshes()[0]
      ?.listPrimitives()[0]
      ?.getAttribute('JOINTS_0')
      ?.getArray();
    assert.ok(joints);
    joints[0] = 255;
    const invalidSource = join(directory, 'invalid-skin.glb');
    await writeFile(invalidSource, await io.writeBinary(document));
    await assert.rejects(
      importModel({
        sourcePath: invalidSource,
        metadataPath: fixture('rigged-animated.asset.json'),
        ...destinations(join(directory, 'build')),
      }),
      /joint index is out of range/,
    );
  });
});
