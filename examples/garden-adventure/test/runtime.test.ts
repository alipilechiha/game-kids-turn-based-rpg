import { describe, expect, it } from 'vitest';
import { getFact, getQuestStatus } from 'waypoint-rpg-narrative';
import { commitRenderedArrival } from '../src/game/rendered-arrival.js';
import { createGardenRuntime } from '../src/game/runtime.js';

describe('Garden game runtime', () => {
  it('starts a fresh playthrough through the core runtime', () => {
    const runtime = createGardenRuntime({ createPlaythroughId: () => 'garden-test' });

    expect(runtime.getState().phase).toBe('title');
    expect(runtime.getState().mapId).toBe('village');
    expect(runtime.getState().narrative.playthroughId).toBe('garden-test');
    expect(
      getQuestStatus(runtime.compiledNarrative, runtime.getState().narrative, 'gardener-quest'),
    ).toBe('locked');
    expect(getFact(runtime.getState().narrative, 'tree-grown')).toBeUndefined();

    runtime.dispatch({ type: 'NEW_GAME' });

    expect(runtime.getState().phase).toBe('playing');
    expect(runtime.getState().mapId).toBe('village');
    expect(runtime.getState().anchorId).toBe('village-square');

    runtime.dispose();
  });

  it('commits only the current rendered route step and ignores callbacks after reset', () => {
    let playthrough = 0;
    const runtime = createGardenRuntime({
      createPlaythroughId: () => `garden-test-${++playthrough}`,
    });
    runtime.dispatch({ type: 'NEW_GAME' });
    runtime.dispatch({ type: 'MOVE_TO', targetId: 'seed-basket' });

    const current = runtime.getState();
    const walk = current.walk!;
    const arrival = {
      mapId: current.mapId,
      committedAnchor: current.anchorId,
      playthroughId: current.narrative.playthroughId,
      routeId: walk.routeId,
      nextIndex: walk.nextIndex,
      targetAnchor: walk.path[walk.nextIndex]!,
    } as const;

    expect(commitRenderedArrival(runtime, arrival)).toBe(true);
    expect(runtime.getState().anchorId).toBe('village-market');
    expect(commitRenderedArrival(runtime, arrival)).toBe(false);
    expect(runtime.getState().anchorId).toBe('village-market');

    // Models a completion callback queued by the old scene just before teardown.
    runtime.dispatch({ type: 'NEW_GAME' });
    const resetState = runtime.getState();
    expect(commitRenderedArrival(runtime, arrival)).toBe(false);
    expect(runtime.getState()).toBe(resetState);
    runtime.dispose();
  });
});
