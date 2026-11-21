import type { Anchor, MapId, MapTransition } from 'waypoint-rpg-core';
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
