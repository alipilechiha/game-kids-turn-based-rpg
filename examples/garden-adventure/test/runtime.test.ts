import { describe, expect, it } from 'vitest';
import { getFact, getQuestStatus } from 'waypoint-rpg-narrative';
import { createGardenRuntime } from '../src/game/runtime.js';

describe('Garden game runtime', () => {
  it('starts a fresh playthrough through the core runtime', () => {
    const runtime = createGardenRuntime({ createPlaythroughId: () => 'garden-test' });

    expect(runtime.getState().phase).toBe('title');
    expect(runtime.getState().mapId).toBe('village');
    expect(runtime.getState().narrative.playthroughId).toBe('garden-test');
    expect(
      getQuestStatus(runtime.compiledNarrative, runtime.getState().narrative, 'gardener'),
    ).toBe('available');
    expect(getFact(runtime.getState().narrative, 'tree-grown')).toBeUndefined();

    runtime.dispatch({ type: 'NEW_GAME' });

    expect(runtime.getState().phase).toBe('playing');
    expect(runtime.getState().mapId).toBe('village');
    expect(runtime.getState().anchorId).toBe('village-square');

    runtime.dispose();
  });
});
