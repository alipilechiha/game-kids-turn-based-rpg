import { describe, expect, it } from 'vitest';
import { findPath } from './pathfinding.ts';
import { neighboursOf, type GraphSource } from './graph.ts';
import type { Anchor, Edge } from './world.ts';

const anchor = (id: Anchor['id'], x: number, walkable = true): Anchor => ({
  id,
  x,
  z: 0,
  walkable,
  areaId: 'area-test',
  mapId: 'map-test',
  npcId: null,
  landmarkId: null,
});

describe('graph adjacency cache isolation', () => {
  it('keeps a complete graph route after a partial graph shares its edge table', () => {
    const a = anchor('anchor-a', 0);
    const b = anchor('anchor-b', 1);
    const c = anchor('anchor-c', 2);
    const edges: readonly Edge[] = [{ from: a.id, to: b.id }];
    const partial: GraphSource = { anchors: [a, c], edges };
    const complete: GraphSource = { anchors: [a, b], edges };

    expect(neighboursOf(partial, c.id)).toEqual([]);
    expect(findPath(complete, b.id, a.id)).toEqual([b.id, a.id]);
  });

  it('does not expose a complete graph node through a partial graph', () => {
    const a = anchor('anchor-a', 0);
    const b = anchor('anchor-b', 1);
    const c = anchor('anchor-c', 2);
    const edges: readonly Edge[] = [{ from: a.id, to: b.id }];
    const complete: GraphSource = { anchors: [a, b], edges };
    const partial: GraphSource = { anchors: [a, c], edges };

    expect(neighboursOf(complete, b.id)).toEqual([a.id]);
    expect(neighboursOf(partial, b.id)).toEqual([]);
  });

  it('filters neighbors using the walkability of the current graph', () => {
    const a = anchor('anchor-a', 0);
    const b = anchor('anchor-b', 1);
    const edges: readonly Edge[] = [{ from: a.id, to: b.id }];
    const walkable: GraphSource = { anchors: [a, b], edges };
    const blocked: GraphSource = { anchors: [a, anchor(b.id, 1, false)], edges };

    expect(neighboursOf(walkable, a.id)).toEqual([b.id]);
    expect(neighboursOf(blocked, a.id)).toEqual([]);
  });

  it('rebuilds adjacency when the edge table changes', () => {
    const a = anchor('anchor-a', 0);
    const b = anchor('anchor-b', 1);
    const c = anchor('anchor-c', 2);
    const anchors = [a, b, c];
    const firstEdges: readonly Edge[] = [{ from: a.id, to: b.id }];
    const nextEdges: readonly Edge[] = [{ from: a.id, to: c.id }];

    expect(neighboursOf({ anchors, edges: firstEdges }, a.id)).toEqual([b.id]);
    expect(neighboursOf({ anchors, edges: nextEdges }, a.id)).toEqual([c.id]);
  });
});
