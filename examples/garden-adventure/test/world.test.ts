import { describe, expect, it } from 'vitest';
import { findPath } from 'waypoint-rpg-core';
import { createGardenRuntime } from '../src/game/runtime.js';
import { gardenGraphs, gardenMaps, gardenTargets, mapTransitions } from '../src/world/world.js';

describe('Garden world navigation', () => {
  it('has a core path from each map entrance to each target', () => {
    for (const mapId of ['village', 'garden'] as const) {
      const map = gardenMaps[mapId];
      const graph = gardenGraphs[mapId];
      const targets = gardenTargets.filter((target) => target.mapId === mapId);

      expect(targets.length).toBeGreaterThanOrEqual(3);
      for (const target of targets) {
        expect(findPath(graph, map.spawnAnchorId, target.anchorId)).not.toEqual([]);
      }
    }
  });

  it('registers a reciprocal village and garden gate pair', () => {
    expect(mapTransitions).toEqual([
      expect.objectContaining({ fromMap: 'map-village', toMap: 'map-garden' }),
      expect.objectContaining({ fromMap: 'map-garden', toMap: 'map-village' }),
    ]);
  });

  it('requires a matching committed waypoint before interacting with a target', () => {
    const runtime = createGardenRuntime({ createPlaythroughId: () => 'garden-test' });
    runtime.dispatch({ type: 'NEW_GAME' });
    const initial = runtime.getState();

    const distantInteraction = runtime.dispatch({ type: 'INTERACT', targetId: 'gardener' });
    expect(distantInteraction).toBe(initial);

    const route = runtime.dispatch({ type: 'MOVE_TO', targetId: 'traveler' });
    expect(route.anchorId).toBe('village-square');
    expect(route.walk?.path[0]).toBe('village-square');
    expect(route.walk?.path.at(-1)).toBe('village-traveler');

    const staleArrival = runtime.dispatch({
      type: 'ARRIVE',
      routeId: 'old-route',
      anchorId: 'village-traveler',
    });
    expect(staleArrival).toBe(route);

    const wrongWaypoint = runtime.dispatch({
      type: 'ARRIVE',
      routeId: route.walk!.routeId,
      anchorId: 'village-traveler',
    });
    expect(wrongWaypoint).toBe(route);

    const nextAnchor = route.walk!.path[route.walk!.nextIndex]!;
    runtime.dispatch({ type: 'ARRIVE', routeId: route.walk!.routeId, anchorId: nextAnchor });
    expect(runtime.getState().anchorId).toBe(nextAnchor);
    expect(runtime.getState().walk?.path.at(-1)).toBe('village-traveler');
    runtime.dispose();
  });

  it('does not let a distant or wrong-map command use a garden target', () => {
    const runtime = createGardenRuntime({ createPlaythroughId: () => 'garden-test' });
    runtime.dispatch({ type: 'NEW_GAME' });
    const village = runtime.getState();

    expect(runtime.dispatch({ type: 'INTERACT', targetId: 'garden-lantern' })).toBe(village);

    const requested = runtime.dispatch({ type: 'MOVE_TO', targetId: 'garden-lantern' });
    expect(requested).toBe(village);
    expect(runtime.getState().mapId).toBe('village');
    runtime.dispose();
  });
});
