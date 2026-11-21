import assert from 'node:assert/strict';
import { log } from 'node:console';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as core from 'waypoint-rpg-core';

const consumerRoot = path.dirname(fileURLToPath(import.meta.url));
const resolvedEntry = path.resolve(fileURLToPath(import.meta.resolve('waypoint-rpg-core')));
const installedEntry = path.resolve(
  consumerRoot,
  'node_modules',
  'waypoint-rpg-core',
  'dist',
  'index.js',
);
assert.equal(resolvedEntry, installedEntry, 'package must resolve from this isolated node_modules');
assert.equal(typeof globalThis.window, 'undefined', 'native runtime must not need browser globals');
assert.deepEqual(Object.keys(core).sort(), [
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
]);

const runtime = core.createGameRuntime(
  {
    createInitialState: () => ({ count: 0, now: 0, restoredFrom: 'initial' }),
    reducer: (state, command, context) => {
      switch (command.kind) {
        case 'add':
          return { ...state, count: state.count + command.by, now: context.now };
        case 'restore-loaded':
          return { ...command.data, now: context.now, restoredFrom: command.slotKey };
        case 'restore-empty':
          return { ...state, now: context.now, restoredFrom: command.slotKey };
        case 'restore-corrupt':
          return { ...state, now: context.now, restoredFrom: `corrupt:${command.slotKey}` };
      }
    },
  },
  { clock: () => 1_700_000_000_123 },
);
const notified = [];
runtime.subscribe((state) => notified.push(state));
runtime.dispatch({ kind: 'add', by: 1 });
assert.deepEqual(runtime.getState(), { count: 1, now: 1_700_000_000_123, restoredFrom: 'initial' });
runtime.pause();
runtime.dispatch({ kind: 'add', by: 2 });
assert.equal(notified.length, 1, 'paused runtime does not notify on every dispatch');
runtime.resume();
assert.equal(notified.length, 2, 'resume flushes the current state once');
assert.equal(notified.at(-1).count, 3);

const readScopes = [];
const savedSlots = [];
const loadResults = new Map([
  ['empty-slot', { kind: 'empty' }],
  ['corrupt-slot', { kind: 'corrupt', reason: 'invalid fixture payload' }],
  ['child-slot-2', { kind: 'loaded', data: { count: 9, now: 0 } }],
]);
const persistence = {
  async load(scope) {
    readScopes.push(scope.slotKey);
    return loadResults.get(scope.slotKey) ?? { kind: 'empty' };
  },
  async save(data, scope) {
    savedSlots.push({ data, slotKey: scope.slotKey });
  },
  onFailure(failure) {
    return failure.kind === 'unavailable'
      ? { kind: 'memory', authoritative: false }
      : { kind: 'none' };
  },
};
const restoreSlot = async (scope) => {
  const result = await persistence.load(scope);
  if (result.kind === 'loaded') {
    runtime.dispatch({ kind: 'restore-loaded', data: result.data, slotKey: scope.slotKey });
  } else if (result.kind === 'empty') {
    runtime.dispatch({ kind: 'restore-empty', slotKey: scope.slotKey });
  } else {
    runtime.dispatch({ kind: 'restore-corrupt', slotKey: scope.slotKey });
  }
  return result;
};

assert.deepEqual(await restoreSlot({ slotKey: 'empty-slot' }), { kind: 'empty' });
assert.equal(runtime.getState().restoredFrom, 'empty-slot');
assert.deepEqual(await restoreSlot({ slotKey: 'corrupt-slot' }), {
  kind: 'corrupt',
  reason: 'invalid fixture payload',
});
assert.equal(runtime.getState().restoredFrom, 'corrupt:corrupt-slot');
assert.deepEqual(await restoreSlot({ slotKey: 'child-slot-2' }), {
  kind: 'loaded',
  data: { count: 9, now: 0 },
});
assert.equal(runtime.getState().count, 9);
assert.deepEqual(readScopes, ['empty-slot', 'corrupt-slot', 'child-slot-2']);
await persistence.save(runtime.getState(), { slotKey: 'child-slot-2' });
assert.equal(savedSlots[0].slotKey, 'child-slot-2');
assert.deepEqual(persistence.onFailure({ kind: 'unavailable' }), {
  kind: 'memory',
  authoritative: false,
});

const anchors = [
  {
    id: 'anchor-a',
    x: 0,
    z: 0,
    walkable: true,
    areaId: 'area-demo',
    mapId: 'map-demo',
    npcId: null,
    landmarkId: null,
  },
  {
    id: 'anchor-b',
    x: 1,
    z: 0,
    walkable: true,
    areaId: 'area-demo',
    mapId: 'map-demo',
    npcId: null,
    landmarkId: null,
  },
  {
    id: 'anchor-c',
    x: 2,
    z: 0,
    walkable: true,
    areaId: 'area-demo',
    mapId: 'map-demo',
    npcId: null,
    landmarkId: 'landmark-gate',
  },
];
const source = {
  anchors,
  edges: [
    { from: 'anchor-a', to: 'anchor-b' },
    { from: 'anchor-b', to: 'anchor-c' },
  ],
};
assert.deepEqual(core.findPath(source, 'anchor-a', 'anchor-c'), [
  'anchor-a',
  'anchor-b',
  'anchor-c',
]);
assert.equal(core.getAnchor(source, 'anchor-c'), anchors[2]);
assert.equal(core.anchorForLandmark(source, 'landmark-gate'), anchors[2]);
assert.deepEqual(core.pathToPoints(source, ['anchor-a', 'anchor-c']), [
  { x: 0, z: 0 },
  { x: 2, z: 0 },
]);
assert.equal(core.insideBounds({ minX: -1, maxX: 3, minZ: -1, maxZ: 1 }, 2, 0), true);
assert.equal(core.nearestWalkableAnchor(source, 1.1, 0), 'anchor-b');

await assert.rejects(import('waypoint-rpg-core/dist/graph.js'), {
  code: 'ERR_PACKAGE_PATH_NOT_EXPORTED',
});

runtime.dispose();
runtime.dispatch({ kind: 'add', by: 5 });
assert.equal(runtime.getState().count, 9, 'dispatch after disposal leaves state unchanged');

log('isolated native ESM consumer passed');
