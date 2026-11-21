import type { Anchor, AnchorId, MapId, MapTransition } from 'waypoint-rpg-core';
import { describe, expect, it, vi } from 'vitest';
import {
  createSceneRegistry,
  SceneHost,
  type SceneDefinition,
  type SceneResource,
} from './scene-host.js';

const EmptyScene = () => null;

function scene(
  id: MapId,
  anchorNames: readonly string[],
  load: SceneDefinition['load'] = async () => ({ Component: EmptyScene, dispose: vi.fn() }),
): SceneDefinition {
  const anchors: Anchor[] = anchorNames.map((name, index) => ({
    id: `anchor-${name}`,
    x: index,
    z: 0,
    walkable: true,
    areaId: `area-${id.slice(4)}`,
    mapId: id,
    npcId: null,
    landmarkId: null,
  }));
  const edges = anchors.slice(1).map((anchor, index) => ({
    from: anchors[index]!.id,
    to: anchor.id,
  }));
  return {
    map: {
      id,
      bounds: { minX: -2, maxX: 4, minZ: -2, maxZ: 2 },
      spawnAnchorId: anchors[0]!.id,
    },
    graph: { anchors, edges },
    camera: { kind: id === 'map-courtyard' ? 'perspective' : 'orthographic' },
    load,
  };
}

function transition(overrides: Partial<MapTransition> = {}): MapTransition {
  return {
    id: 'transition-to-workshop',
    fromMap: 'map-courtyard',
    fromAnchor: 'anchor-courtyard-door',
    toMap: 'map-workshop',
    toAnchor: 'anchor-workshop-door',
    ...overrides,
  };
}

function registry(
  courtyard = scene('map-courtyard', ['courtyard-start', 'courtyard-door']),
  workshop = scene('map-workshop', ['workshop-door', 'workshop-lamp']),
  routes: readonly MapTransition[] = [transition()],
) {
  return createSceneRegistry([courtyard, workshop], routes);
}

describe('scene registry', () => {
  it('rejects duplicate scenes and unknown scene ids', () => {
    const courtyard = scene('map-courtyard', ['courtyard-start', 'courtyard-door']);
    expect(() => createSceneRegistry([courtyard, courtyard], [])).toThrow(/duplicate scene/i);
    expect(() => registry().getScene('map-missing')).toThrow(/unknown scene/i);
  });

  it('rejects transitions with missing maps, anchors, or a disconnected route', () => {
    const courtyard = scene('map-courtyard', ['courtyard-start', 'courtyard-door']);
    const workshop = scene('map-workshop', ['workshop-door']);
    expect(() => registry(courtyard, workshop, [transition({ toMap: 'map-missing' })])).toThrow(
      /unknown scene/i,
    );
    expect(() =>
      registry(courtyard, workshop, [transition({ fromAnchor: 'anchor-unreachable' })]),
    ).toThrow(/source anchor/i);
    expect(() =>
      registry(scene('map-courtyard', ['courtyard-start', 'courtyard-door']), workshop, [
        transition(),
      ]),
    ).not.toThrow();
    expect(() =>
      registry(
        {
          ...courtyard,
          graph: { anchors: courtyard.graph.anchors, edges: [] },
        },
        workshop,
        [transition()],
      ),
    ).toThrow(/no path/i);
  });

  it('rejects duplicate transition ids', () => {
    const route = transition();
    expect(() => registry(undefined, undefined, [route, route])).toThrow(/duplicate transition/i);
  });
});

describe('scene host lifecycle', () => {
  it('starts at a validated anchor while preserving the default spawn behavior', async () => {
    const host = new SceneHost(registry());

    expect((await host.start('map-courtyard')).status).toBe('committed');
    expect(host.getSnapshot().currentAnchorId).toBe('anchor-courtyard-start');
    expect((await host.start('map-workshop', 'anchor-workshop-lamp')).status).toBe('committed');
    expect(host.getSnapshot().active?.entryAnchorId).toBe('anchor-workshop-lamp');
    expect(host.getSnapshot().currentAnchorId).toBe('anchor-workshop-lamp');
    host.dispose();
  });

  it('rejects unknown, non-walkable, and wrong-map start anchors without changing the scene', async () => {
    const workshop = scene('map-workshop', ['workshop-door', 'workshop-lamp']);
    const blockedWorkshop: SceneDefinition = {
      ...workshop,
      graph: {
        ...workshop.graph,
        anchors: workshop.graph.anchors.map((anchor) =>
          anchor.id === 'anchor-workshop-lamp' ? { ...anchor, walkable: false } : anchor,
        ),
      },
    };
    const host = new SceneHost(registry(undefined, blockedWorkshop));
    await host.start('map-courtyard');
    const active = host.getSnapshot().active;
    const currentAnchorId = host.getSnapshot().currentAnchorId;

    expect((await host.start('map-workshop', 'anchor-missing' as AnchorId)).status).toBe('invalid');
    expect((await host.start('map-workshop', 'anchor-workshop-lamp')).status).toBe('invalid');
    expect((await host.start('map-workshop', 'anchor-courtyard-start')).status).toBe('invalid');
    expect(host.getSnapshot().active).toBe(active);
    expect(host.getSnapshot().currentAnchorId).toBe(currentAnchorId);
    host.dispose();
  });

  it('keeps the previous committed location when an explicit restoration load fails', async () => {
    const workshop = {
      ...scene('map-workshop', ['workshop-door', 'workshop-lamp']),
      load: async () => {
        throw new Error('restore failed');
      },
    };
    const host = new SceneHost(registry(undefined, workshop));
    await host.start('map-courtyard');
    const before = host.getSnapshot();

    expect((await host.start('map-workshop', 'anchor-workshop-lamp')).status).toBe('failed');
    expect(host.getSnapshot().active).toBe(before.active);
    expect(host.getSnapshot().currentAnchorId).toBe(before.currentAnchorId);
    host.dispose();
  });

  it('cancels a superseded explicit start and cannot commit its late scene result', async () => {
    let resolveStale!: (resource: SceneResource) => void;
    let staleSignal: AbortSignal | undefined;
    const staleDispose = vi.fn();
    const workshop = {
      ...scene('map-workshop', ['workshop-door', 'workshop-lamp']),
      load: (signal: AbortSignal) => {
        staleSignal = signal;
        return new Promise<SceneResource>((resolve) => {
          resolveStale = resolve;
        });
      },
    };
    const host = new SceneHost(registry(undefined, workshop));
    await host.start('map-courtyard');

    const stale = host.start('map-workshop', 'anchor-workshop-lamp');
    const fresh = host.start('map-courtyard', 'anchor-courtyard-door');
    expect((await fresh).status).toBe('committed');
    resolveStale({ Component: EmptyScene, dispose: staleDispose });

    expect((await stale).status).toBe('cancelled');
    expect(staleSignal?.aborted).toBe(true);
    expect(staleDispose).toHaveBeenCalledOnce();
    expect(host.getSnapshot().active?.definition.map.id).toBe('map-courtyard');
    expect(host.getSnapshot().currentAnchorId).toBe('anchor-courtyard-door');
    host.dispose();
  });

  it('keeps the active scene until the destination loads, then releases it', async () => {
    const oldDispose = vi.fn();
    const newDispose = vi.fn();
    const courtyard = scene('map-courtyard', ['courtyard-start', 'courtyard-door'], async () => ({
      Component: EmptyScene,
      dispose: oldDispose,
    }));
    const workshop = {
      ...scene('map-workshop', ['workshop-door', 'workshop-lamp']),
      load: async () => ({ Component: EmptyScene, dispose: newDispose }),
    };
    const host = new SceneHost(registry(courtyard, workshop));
    await host.start('map-courtyard');

    const pending = host.transition('transition-to-workshop');
    expect(host.getSnapshot().active?.definition.map.id).toBe('map-courtyard');
    expect(host.getSnapshot().pendingMapId).toBe('map-workshop');
    expect((await pending).status).toBe('committed');
    expect(host.getSnapshot().active?.entryAnchorId).toBe('anchor-workshop-door');
    expect(oldDispose).toHaveBeenCalledTimes(1);

    host.dispose();
    expect(newDispose).toHaveBeenCalledTimes(1);
  });

  it('preserves the current scene after a failed load and can retry', async () => {
    const oldDispose = vi.fn();
    const retryDispose = vi.fn();
    const courtyard = scene('map-courtyard', ['courtyard-start', 'courtyard-door'], async () => ({
      Component: EmptyScene,
      dispose: oldDispose,
    }));
    let attempts = 0;
    const workshop = {
      ...scene('map-workshop', ['workshop-door', 'workshop-lamp']),
      load: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('module load failed');
        return { Component: EmptyScene, dispose: retryDispose };
      },
    };
    const host = new SceneHost(registry(courtyard, workshop));
    await host.start('map-courtyard');

    expect((await host.transition('transition-to-workshop')).status).toBe('failed');
    expect(host.getSnapshot().active?.definition.map.id).toBe('map-courtyard');
    expect(host.getSnapshot().error).toContain('module load failed');
    expect(oldDispose).not.toHaveBeenCalled();
    expect((await host.transition('transition-to-workshop')).status).toBe('committed');

    host.dispose();
    expect(oldDispose).toHaveBeenCalledTimes(1);
    expect(retryDispose).toHaveBeenCalledTimes(1);
  });

  it('aborts a superseded load and disposes its late result', async () => {
    let resolveFirst!: (resource: SceneResource) => void;
    let firstSignal: AbortSignal | undefined;
    const staleDispose = vi.fn();
    const activeDispose = vi.fn();
    const workshop = {
      ...scene('map-workshop', ['workshop-door', 'workshop-lamp']),
      load: vi.fn((signal: AbortSignal) => {
        if (workshop.load.mock.calls.length === 1) {
          firstSignal = signal;
          return new Promise<SceneResource>((resolve) => {
            resolveFirst = resolve;
          });
        }
        return Promise.resolve({ Component: EmptyScene, dispose: activeDispose });
      }),
    };
    const host = new SceneHost(registry(undefined, workshop));
    await host.start('map-courtyard');

    const first = host.transition('transition-to-workshop');
    const second = host.transition('transition-to-workshop');
    expect((await second).status).toBe('committed');
    resolveFirst({ Component: EmptyScene, dispose: staleDispose });

    expect((await first).status).toBe('cancelled');
    expect(firstSignal?.aborted).toBe(true);
    expect(staleDispose).toHaveBeenCalledTimes(1);
    expect(host.getSnapshot().active?.definition.map.id).toBe('map-workshop');
    host.dispose();
  });

  it('disposes active and late resources when the host is disposed during a load', async () => {
    let resolvePending!: (resource: SceneResource) => void;
    const activeDispose = vi.fn();
    const lateDispose = vi.fn();
    const courtyard = scene('map-courtyard', ['courtyard-start', 'courtyard-door'], async () => ({
      Component: EmptyScene,
      dispose: activeDispose,
    }));
    const workshop = {
      ...scene('map-workshop', ['workshop-door', 'workshop-lamp']),
      load: () =>
        new Promise<SceneResource>((resolve) => {
          resolvePending = resolve;
        }),
    };
    const host = new SceneHost(registry(courtyard, workshop));
    await host.start('map-courtyard');
    const pending = host.transition('transition-to-workshop');
    host.dispose();
    resolvePending({ Component: EmptyScene, dispose: lateDispose });

    expect((await pending).status).toBe('cancelled');
    expect(activeDispose).toHaveBeenCalledTimes(1);
    expect(lateDispose).toHaveBeenCalledTimes(1);
  });

  it('stops notifying unsubscribed listeners', async () => {
    const host = new SceneHost(registry());
    const listener = vi.fn();
    const unsubscribe = host.subscribe(listener);
    unsubscribe();
    await host.start('map-courtyard');
    expect(listener).not.toHaveBeenCalled();
    host.dispose();
  });
});
