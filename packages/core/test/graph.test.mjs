import assert from 'node:assert/strict';
import test from 'node:test';
import { findPath, neighboursOf } from '../dist/index.js';

const anchor = (id, x, walkable = true) => ({
  id,
  x,
  z: 0,
  walkable,
  areaId: 'area-test',
  mapId: 'map-test',
  npcId: null,
  landmarkId: null,
});

test('keeps a complete graph route when a partial graph shares its edge array', () => {
  const a = anchor('anchor-a', 0);
  const b = anchor('anchor-b', 1);
  const c = anchor('anchor-c', 2);
  const edges = [{ from: a.id, to: b.id }];
  const partial = { anchors: [a, c], edges };
  const complete = { anchors: [a, b], edges };

  assert.deepEqual(neighboursOf(partial, c.id), []);
  assert.deepEqual(findPath(complete, b.id, a.id), [b.id, a.id]);
});

test('does not expose a complete graph node through a partial graph', () => {
  const a = anchor('anchor-a', 0);
  const b = anchor('anchor-b', 1);
  const c = anchor('anchor-c', 2);
  const edges = [{ from: a.id, to: b.id }];
  const complete = { anchors: [a, b], edges };
  const partial = { anchors: [a, c], edges };

  assert.deepEqual(neighboursOf(complete, b.id), [a.id]);
  assert.deepEqual(neighboursOf(partial, b.id), []);
});

test('filters neighbors using each graph source anchor table', () => {
  const a = anchor('anchor-a', 0);
  const b = anchor('anchor-b', 1);
  const edges = [{ from: a.id, to: b.id }];
  const walkable = { anchors: [a, b], edges };
  const blocked = { anchors: [a, anchor(b.id, 1, false)], edges };

  assert.deepEqual(neighboursOf(walkable, a.id), [b.id]);
  assert.deepEqual(neighboursOf(blocked, a.id), []);
});

test('rebuilds adjacency when the edge array changes for the same anchors', () => {
  const a = anchor('anchor-a', 0);
  const b = anchor('anchor-b', 1);
  const c = anchor('anchor-c', 2);
  const anchors = [a, b, c];
  const firstEdges = [{ from: a.id, to: b.id }];
  const nextEdges = [{ from: a.id, to: c.id }];

  assert.deepEqual(neighboursOf({ anchors, edges: firstEdges }, a.id), [b.id]);
  assert.deepEqual(neighboursOf({ anchors, edges: nextEdges }, a.id), [c.id]);
});
