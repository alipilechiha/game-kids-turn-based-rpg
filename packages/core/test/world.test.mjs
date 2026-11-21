import assert from 'node:assert/strict';
import test from 'node:test';
import {
  anchorForLandmark,
  anchorForNpc,
  findPath,
  getAnchor,
  getAnchorOrNull,
  insideBounds,
  nearestWalkableAnchor,
  neighboursOf,
  pathToPoints,
} from '../dist/index.js';

const a = {
  id: 'anchor-a',
  x: 0,
  z: 0,
  walkable: true,
  areaId: 'area-test',
  mapId: 'map-test',
  npcId: 'npc-guide',
  landmarkId: null,
};
const b = {
  id: 'anchor-b',
  x: 1,
  z: 0,
  walkable: true,
  areaId: 'area-test',
  mapId: 'map-test',
  npcId: null,
  landmarkId: 'landmark-gate',
};
const source = {
  anchors: [a, b],
  edges: [{ from: a.id, to: b.id }],
};

test('exports pure world geometry and graph helpers from the package root', () => {
  assert.equal(insideBounds({ minX: -1, maxX: 2, minZ: -1, maxZ: 2 }, 0, 0), true);
  assert.equal(getAnchor(source, a.id), a);
  assert.equal(getAnchorOrNull(source, 'anchor-missing'), null);
  assert.equal(anchorForNpc(source, a.npcId), a);
  assert.equal(anchorForLandmark(source, b.landmarkId), b);
  assert.deepEqual(neighboursOf(source, a.id), [b.id]);
  assert.deepEqual(findPath(source, a.id, b.id), [a.id, b.id]);
  assert.equal(nearestWalkableAnchor(source, 0.1, 0), a.id);
  assert.deepEqual(pathToPoints(source, [a.id, b.id]), [
    { x: 0, z: 0 },
    { x: 1, z: 0 },
  ]);
});
