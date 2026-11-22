import { getDialogueView, getFact, getQuestStatus } from 'waypoint-rpg-narrative';
import { describe, expect, it } from 'vitest';
import { createGardenRuntime } from '../src/game/runtime.js';
import type { GardenTargetId } from '../src/world/world.js';

function reach(runtime: ReturnType<typeof createGardenRuntime>, targetId: GardenTargetId) {
  const state = runtime.getState();
  runtime.dispatch({ type: 'MOVE_TO', targetId });
  let walk = runtime.getState().walk;
  if (!walk) throw new Error(`Could not route to ${targetId}.`);
  while (walk) {
    const anchorId = walk.path[walk.nextIndex];
    if (!anchorId) throw new Error('Route did not contain its next waypoint.');
    runtime.dispatch({ type: 'ARRIVE', routeId: walk.routeId, anchorId });
    walk = runtime.getState().walk;
  }
  if (runtime.getState().mapId !== state.mapId)
    throw new Error('Walking unexpectedly changed maps.');
}

function interact(runtime: ReturnType<typeof createGardenRuntime>, targetId: GardenTargetId) {
  reach(runtime, targetId);
  runtime.dispatch({ type: 'INTERACT', targetId });
  return runtime.getState();
}

function startGame(runtime: ReturnType<typeof createGardenRuntime>) {
  runtime.dispatch({ type: 'NEW_GAME' });
}

describe('Garden story paths', () => {
  it('plants the gardener’s seed and grows a tree in the garden', () => {
    const runtime = createGardenRuntime({ createPlaythroughId: () => 'garden-seed-story' });
    startGame(runtime);

    runtime.dispatch({ type: 'INTERACT', targetId: 'seed-basket' });
    expect(getFact(runtime.getState().narrative, 'seed-found')).toBeUndefined();

    interact(runtime, 'gardener');
    const villageDialogue = getDialogueView(
      runtime.compiledNarrative,
      runtime.getState().narrative,
      'fa',
    );
    expect(villageDialogue?.speakerId).toBe('village-guide');
    expect(villageDialogue?.choices).toContainEqual(
      expect.objectContaining({
        id: 'listen-gardener',
        label: 'گفت‌وگو با باغبان',
        available: true,
      }),
    );
    runtime.dispatch({ type: 'DIALOGUE_CHOICE', choiceId: 'listen-gardener' });
    const gardenerDialogue = getDialogueView(
      runtime.compiledNarrative,
      runtime.getState().narrative,
      'fa',
    );
    expect(gardenerDialogue?.speakerId).toBe('gardener');
    expect(gardenerDialogue?.choices).toContainEqual(
      expect.objectContaining({ id: 'help-gardener', available: true }),
    );
    runtime.dispatch({ type: 'DIALOGUE_CHOICE', choiceId: 'help-gardener' });
    expect(
      getQuestStatus(runtime.compiledNarrative, runtime.getState().narrative, 'gardener-quest'),
    ).toBe('active');
    expect(getFact(runtime.getState().narrative, 'story-path')).toBe('gardener');

    interact(runtime, 'seed-basket');
    expect(getFact(runtime.getState().narrative, 'seed-found')).toBe(true);
    interact(runtime, 'garden-gate');
    expect(runtime.getState().mapId).toBe('garden');
    interact(runtime, 'planting-bed');

    expect(
      getQuestStatus(runtime.compiledNarrative, runtime.getState().narrative, 'gardener-quest'),
    ).toBe('completed');
    expect(getFact(runtime.getState().narrative, 'tree-grown')).toBe(true);
    expect(getFact(runtime.getState().narrative, 'garden-outcome')).toBe('tree');
    expect(runtime.getState().narrative.endingId).toBe('ending-garden');
    expect(runtime.getState().narrative.appliedTriggerIds).toContain('plant-garden-seed');

    const completed = runtime.getState();
    runtime.dispatch({ type: 'INTERACT', targetId: 'planting-bed' });
    expect(runtime.getState()).toBe(completed);
    runtime.dispose();
  });

  it('reveals the traveler’s clue and lights the lantern for a different ending', () => {
    const runtime = createGardenRuntime({ createPlaythroughId: () => 'garden-light-story' });
    startGame(runtime);

    interact(runtime, 'traveler');
    const villageDialogue = getDialogueView(
      runtime.compiledNarrative,
      runtime.getState().narrative,
      'fa',
    );
    expect(villageDialogue?.speakerId).toBe('village-guide');
    expect(villageDialogue?.choices).toContainEqual(
      expect.objectContaining({ id: 'meet-traveler', label: 'پرسیدن از مسافر', available: true }),
    );
    runtime.dispatch({ type: 'DIALOGUE_CHOICE', choiceId: 'meet-traveler' });
    const travelerDialogue = getDialogueView(
      runtime.compiledNarrative,
      runtime.getState().narrative,
      'fa',
    );
    expect(travelerDialogue?.speakerId).toBe('traveler');
    expect(travelerDialogue?.choices).toContainEqual(
      expect.objectContaining({ id: 'follow-light', available: true }),
    );
    runtime.dispatch({ type: 'DIALOGUE_CHOICE', choiceId: 'follow-light' });
    expect(
      getQuestStatus(runtime.compiledNarrative, runtime.getState().narrative, 'lantern-quest'),
    ).toBe('active');
    expect(getFact(runtime.getState().narrative, 'story-path')).toBe('lantern');

    interact(runtime, 'garden-gate');
    interact(runtime, 'ancient-lantern');
    expect(getFact(runtime.getState().narrative, 'clue-found')).toBeUndefined();
    expect(getFact(runtime.getState().narrative, 'lantern-lit')).toBeUndefined();

    interact(runtime, 'clue-stone');
    expect(getFact(runtime.getState().narrative, 'clue-found')).toBe(true);
    interact(runtime, 'ancient-lantern');

    expect(
      getQuestStatus(runtime.compiledNarrative, runtime.getState().narrative, 'lantern-quest'),
    ).toBe('completed');
    expect(getFact(runtime.getState().narrative, 'lantern-lit')).toBe(true);
    expect(getFact(runtime.getState().narrative, 'garden-outcome')).toBe('lantern');
    expect(getFact(runtime.getState().narrative, 'tree-grown')).toBeUndefined();
    expect(runtime.getState().narrative.endingId).toBe('ending-lantern');
    runtime.dispose();
  });
});
