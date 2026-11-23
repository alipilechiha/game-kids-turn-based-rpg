import {
  getCharacterAttributes,
  getCharacterLevel,
  getEffectiveCharacterAttributes,
  getUnlockedAbilityIds,
} from 'waypoint-rpg-gameplay';
import { getDialogueView, getFact, getQuestStatus } from 'waypoint-rpg-narrative';
import { describe, expect, it } from 'vitest';
import { gardenNarrativeDefinition } from '../src/content/story.js';
import { createGardenRuntime } from '../src/game/runtime.js';
import type { GardenCommand, GardenRuntime } from '../src/game/runtime.js';
import type { GardenTargetId } from '../src/world/world.js';

function reach(runtime: GardenRuntime, targetId: GardenTargetId) {
  const target = runtime.getState().mapId;
  const destination = runtime.getState();
  runtime.dispatch({ type: 'MOVE_TO', targetId });
  let walk = runtime.getState().walk;
  if (!walk && runtime.getState().anchorId !== destination.anchorId)
    throw new Error(`Could not route to ${targetId}.`);
  while (walk) {
    const anchorId = walk.path[walk.nextIndex];
    if (!anchorId) throw new Error('Route did not contain its next waypoint.');
    runtime.dispatch({ type: 'ARRIVE', routeId: walk.routeId, anchorId });
    walk = runtime.getState().walk;
  }
  if (runtime.getState().mapId !== target) throw new Error('Walking unexpectedly changed maps.');
}

function interact(runtime: GardenRuntime, targetId: GardenTargetId) {
  reach(runtime, targetId);
  runtime.dispatch({ type: 'INTERACT', targetId });
  return runtime.getState();
}

function choose(runtime: GardenRuntime, choiceId: string) {
  runtime.dispatch({ type: 'DIALOGUE_CHOICE', choiceId });
  return runtime.getState();
}

function startGame(runtime: GardenRuntime) {
  runtime.dispatch({ type: 'NEW_GAME' });
}

function startGardenerPath(runtime: GardenRuntime) {
  startGame(runtime);
  interact(runtime, 'gardener');
  choose(runtime, 'listen-gardener');
  choose(runtime, 'help-gardener');
}

function startGuardianTrial(runtime: GardenRuntime) {
  startGame(runtime);
  interact(runtime, 'traveler');
  choose(runtime, 'meet-traveler');
  choose(runtime, 'follow-light');
  interact(runtime, 'garden-gate');
  interact(runtime, 'clue-stone');
  interact(runtime, 'guardian');
  const dialogue = getDialogueView(runtime.compiledNarrative, runtime.getState().narrative, 'fa');
  expect(dialogue?.speakerId).toBe('guardian');
  expect(dialogue?.choices).toContainEqual(
    expect.objectContaining({ id: 'challenge-guardian', available: true }),
  );
  choose(runtime, 'challenge-guardian');
}

function battle(
  runtime: GardenRuntime,
  intent: Extract<GardenCommand, { type: 'BATTLE_ACTION' }>['intent'],
  overrides: Partial<Extract<GardenCommand, { type: 'BATTLE_ACTION' }>> = {},
) {
  const state = runtime.getState();
  const encounter = state.gameplay.encounter;
  if (!encounter) throw new Error('No gameplay-package encounter is active.');
  runtime.dispatch({
    type: 'BATTLE_ACTION',
    playthroughId: state.gameplay.playthroughId,
    expectedRevision: state.gameplay.revision,
    encounterInstanceId: encounter.instanceId,
    intent,
    ...overrides,
  });
  return runtime.getState();
}

function completeGuardianTrial(runtime: GardenRuntime) {
  const moved = battle(runtime, {
    type: 'move',
    participantId: 'hero-seat',
    destination: { x: 2, y: 2 },
  });
  expect(moved.gameplay.encounter?.combatants[1]?.position).toEqual({ x: 4, y: 2 });
  expect(
    moved.gameplay.encounter?.combatants[0]?.statuses.map((status) => status.statusEffectId),
  ).toContain('pollen-dusted');

  const guarded = battle(runtime, {
    type: 'use-ability',
    participantId: 'hero-seat',
    abilityId: 'gentle-ward',
    targetParticipantId: 'hero-seat',
  });
  expect(
    guarded.gameplay.encounter?.combatants[0]?.statuses.map((status) => status.statusEffectId),
  ).toEqual(expect.arrayContaining(['steady-glow', 'pollen-dusted']));
  battle(runtime, {
    type: 'use-ability',
    participantId: 'hero-seat',
    abilityId: 'light-ray',
    targetParticipantId: 'guardian-seat',
  });
  return battle(runtime, {
    type: 'use-ability',
    participantId: 'hero-seat',
    abilityId: 'light-ray',
    targetParticipantId: 'guardian-seat',
  });
}

describe('Garden story and Phase 4 gameplay integration', () => {
  it('uses the gameplay package inventory and progression for the gardener ending', () => {
    const runtime = createGardenRuntime({ createPlaythroughId: () => 'garden-seed-story' });
    startGardenerPath(runtime);

    const beforeSeed = runtime.getState();
    runtime.dispatch({ type: 'INTERACT', targetId: 'seed-basket' });
    expect(runtime.getState()).toBe(beforeSeed);

    const basket = interact(runtime, 'seed-basket');
    expect(getFact(basket.narrative, 'seed-found')).toBe(true);
    expect(basket.gameplay.inventory['special-seed']).toBe(1);
    expect(basket.gameplay.appliedRewardIds).toContain('garden-seed');

    interact(runtime, 'garden-gate');
    const beforePlanting = runtime.getState();
    const planted = interact(runtime, 'planting-bed');
    expect(getQuestStatus(runtime.compiledNarrative, planted.narrative, 'gardener-quest')).toBe(
      'completed',
    );
    expect(getFact(planted.narrative, 'tree-grown')).toBe(true);
    expect(planted.narrative.endingId).toBe('ending-garden');
    expect(planted.gameplay.inventory['special-seed']).toBeUndefined();
    expect(planted.gameplay.inventory['garden-reward']).toBe(1);
    expect(planted.gameplay.inventory['lantern-charm']).toBe(1);
    expect(planted.gameplay.equipment['garden-hero']?.charm).toBe('lantern-charm');
    expect(getCharacterLevel(runtime.compiledGameplay, planted.gameplay, 'garden-hero')).toBe(2);
    expect(
      getUnlockedAbilityIds(runtime.compiledGameplay, planted.gameplay, 'garden-hero'),
    ).toContain('star-bloom');
    expect(planted.gameplay.appliedRewardIds).toEqual(['garden-seed', 'garden-restoration']);
    expect(planted).not.toBe(beforePlanting);

    const repeated = runtime.dispatch({ type: 'INTERACT', targetId: 'planting-bed' });
    expect(repeated).toBe(planted);
    runtime.dispatch({ type: 'TOGGLE_CHARM' });
    expect(runtime.getState().gameplay.equipment['garden-hero']).toBeUndefined();
    expect(runtime.getState().gameplay.inventory['lantern-charm']).toBe(1);
    runtime.dispatch({ type: 'TOGGLE_CHARM' });
    expect(runtime.getState().gameplay.equipment['garden-hero']?.charm).toBe('lantern-charm');
    runtime.dispose();
  });

  it('completes a deterministic 5x5 guardian encounter and commits its narrative consequence', () => {
    const runtime = createGardenRuntime({ createPlaythroughId: () => 'garden-light-story' });
    startGuardianTrial(runtime);
    const started = runtime.getState();
    expect(started.gameplay.playthroughId).toBe(started.narrative.playthroughId);
    expect(started.gameplay.encounter).toMatchObject({
      definitionId: 'guardian-trial',
      outcome: null,
    });
    expect(runtime.compiledGameplay.definition.boards[0]).toMatchObject({ width: 5, height: 5 });

    const blocked = battle(runtime, {
      type: 'move',
      participantId: 'hero-seat',
      destination: { x: 4, y: 2 },
    });
    expect(blocked).toBe(started);

    const outOfRange = battle(runtime, {
      type: 'use-ability',
      participantId: 'hero-seat',
      abilityId: 'light-ray',
      targetParticipantId: 'guardian-seat',
    });
    expect(outOfRange).toBe(started);

    const staleIntent = {
      type: 'BATTLE_ACTION' as const,
      playthroughId: started.gameplay.playthroughId,
      expectedRevision: started.gameplay.revision,
      encounterInstanceId: started.gameplay.encounter!.instanceId,
      intent: {
        type: 'move' as const,
        participantId: 'hero-seat',
        destination: { x: 2, y: 2 },
      },
    };
    const moved = runtime.dispatch(staleIntent);
    const stale = runtime.dispatch(staleIntent);
    expect(moved).not.toBe(started);
    expect(stale).toBe(moved);
    expect(moved.gameplay.encounter?.combatants[0]?.statuses[0]?.statusEffectId).toBe(
      'pollen-dusted',
    );
    expect(
      getEffectiveCharacterAttributes(
        runtime.compiledGameplay,
        moved.gameplay,
        'garden-hero',
        'hero-seat',
      ).steps,
    ).toBe(1);

    const won = completeGuardianTrial(runtime);
    expect(won.gameplay.encounter?.outcome).toBe('victory');
    expect(won.gameplay.outcomeMarkers).toEqual([
      expect.objectContaining({
        outcome: 'victory',
        consequenceId: 'guardian-victory',
      }),
    ]);
    expect(won.gameplay.characterProgress['garden-hero']?.experience).toBe(24);
    expect(won.gameplay.inventory['garden-reward']).toBe(1);
    expect(won.gameplay.equipment['garden-hero']?.charm).toBe('lantern-charm');
    expect(getCharacterLevel(runtime.compiledGameplay, won.gameplay, 'garden-hero')).toBe(2);
    expect(getFact(won.narrative, 'lantern-lit')).toBe(true);
    expect(getFact(won.narrative, 'garden-outcome')).toBe('guardian');
    expect(getQuestStatus(runtime.compiledNarrative, won.narrative, 'lantern-quest')).toBe(
      'completed',
    );
    expect(won.narrative.endingId).toBe('ending-lantern');
    runtime.dispose();
  });

  it('rolls back a terminal gameplay outcome when the authored narrative trigger rejects it', () => {
    const definition = {
      ...gardenNarrativeDefinition,
      triggers: gardenNarrativeDefinition.triggers?.filter(
        (trigger) => trigger.id !== 'guardian-victory',
      ),
    };
    const runtime = createGardenRuntime({
      createPlaythroughId: () => 'garden-atomic-story',
      definition,
    });
    startGuardianTrial(runtime);
    battle(runtime, {
      type: 'move',
      participantId: 'hero-seat',
      destination: { x: 2, y: 2 },
    });
    battle(runtime, {
      type: 'use-ability',
      participantId: 'hero-seat',
      abilityId: 'gentle-ward',
      targetParticipantId: 'hero-seat',
    });
    battle(runtime, {
      type: 'use-ability',
      participantId: 'hero-seat',
      abilityId: 'light-ray',
      targetParticipantId: 'guardian-seat',
    });
    const beforeTerminalAction = runtime.getState();
    const rejectedTransaction = battle(runtime, {
      type: 'use-ability',
      participantId: 'hero-seat',
      abilityId: 'light-ray',
      targetParticipantId: 'guardian-seat',
    });
    expect(rejectedTransaction).toBe(beforeTerminalAction);
    expect(rejectedTransaction.gameplay.encounter?.outcome).toBeNull();
    expect(rejectedTransaction.gameplay.characterProgress['garden-hero']?.experience).toBe(0);
    expect(rejectedTransaction.gameplay.inventory['garden-reward']).toBeUndefined();
    expect(getFact(rejectedTransaction.narrative, 'lantern-lit')).toBeUndefined();
    runtime.dispose();
  });

  it('records a nonpunitive withdrawal, rejects stale playthrough commands, and allows a retry', () => {
    let id = 0;
    const runtime = createGardenRuntime({ createPlaythroughId: () => `garden-retry-${++id}` });
    startGuardianTrial(runtime);
    const beforeReset = runtime.getState();
    const stale = {
      type: 'BATTLE_ACTION' as const,
      playthroughId: beforeReset.gameplay.playthroughId,
      expectedRevision: beforeReset.gameplay.revision,
      encounterInstanceId: beforeReset.gameplay.encounter!.instanceId,
      intent: { type: 'withdraw' as const },
    };
    const withdrew = runtime.dispatch(stale);
    expect(withdrew.gameplay.encounter?.outcome).toBe('withdrawn');
    expect(getQuestStatus(runtime.compiledNarrative, withdrew.narrative, 'lantern-quest')).toBe(
      'active',
    );
    expect(withdrew.gameplay.characterProgress['garden-hero']?.experience).toBe(0);
    expect(withdrew.gameplay.inventory).toEqual({});
    expect(withdrew.narrative.endingId).toBeNull();
    expect(getFact(withdrew.narrative, 'trial-result')).toBe('try-again');
    expect(runtime.dispatch(stale)).toBe(withdrew);

    const newPlaythrough = runtime.dispatch({ type: 'NEW_GAME' });
    expect(newPlaythrough.gameplay.playthroughId).not.toBe(beforeReset.gameplay.playthroughId);
    expect(runtime.dispatch(stale)).toBe(newPlaythrough);
    runtime.dispose();
  });

  it('keeps the equipment modifier in the package selector result', () => {
    const runtime = createGardenRuntime({ createPlaythroughId: () => 'garden-derived-stats' });
    startGardenerPath(runtime);
    interact(runtime, 'seed-basket');
    interact(runtime, 'garden-gate');
    const planted = interact(runtime, 'planting-bed');
    expect(
      getCharacterAttributes(runtime.compiledGameplay, planted.gameplay, 'garden-hero').steps,
    ).toBe(3);
    runtime.dispatch({ type: 'TOGGLE_CHARM' });
    expect(
      getCharacterAttributes(runtime.compiledGameplay, runtime.getState().gameplay, 'garden-hero')
        .steps,
    ).toBe(2);
    runtime.dispose();
  });
});
