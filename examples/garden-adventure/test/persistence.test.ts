import { describe, expect, it } from 'vitest';
import { createGardenRuntime, type GardenRuntime } from '../src/game/runtime.js';
import {
  decodeGardenSave,
  encodeGardenSave,
  inspectGardenSave,
  GARDEN_SAVE_KEY,
  type GardenStorage,
  type GardenSaveSnapshot,
} from '../src/persistence/garden-save.js';
import type { GardenTargetId } from '../src/world/world.js';

function memoryStorage(initial: string | null = null) {
  let value = initial;
  const storage: GardenStorage = {
    getItem: () => value,
    setItem: (_key, next) => {
      value = next;
    },
    removeItem: () => {
      value = null;
    },
  };
  return { storage, read: () => value };
}

function reach(runtime: GardenRuntime, targetId: GardenTargetId) {
  const prior = runtime.getState();
  runtime.dispatch({ type: 'MOVE_TO', targetId });
  let walk = runtime.getState().walk;
  if (!walk && runtime.getState().anchorId !== prior.anchorId)
    throw new Error(`Could not route to ${targetId}.`);
  while (walk) {
    const anchorId = walk.path[walk.nextIndex];
    if (!anchorId) throw new Error('Route did not include a destination.');
    runtime.dispatch({ type: 'ARRIVE', routeId: walk.routeId, anchorId });
    walk = runtime.getState().walk;
  }
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

function gardenerSaveRuntime() {
  const runtime = createGardenRuntime({ createPlaythroughId: () => 'saved-garden' });
  runtime.dispatch({ type: 'NEW_GAME' });
  interact(runtime, 'gardener');
  choose(runtime, 'listen-gardener');
  choose(runtime, 'help-gardener');
  interact(runtime, 'seed-basket');
  interact(runtime, 'garden-gate');
  return runtime;
}

function guardianCombatRuntime() {
  const runtime = createGardenRuntime({ createPlaythroughId: () => 'saved-trial' });
  runtime.dispatch({ type: 'NEW_GAME' });
  interact(runtime, 'traveler');
  choose(runtime, 'meet-traveler');
  choose(runtime, 'follow-light');
  interact(runtime, 'garden-gate');
  interact(runtime, 'clue-stone');
  interact(runtime, 'guardian');
  choose(runtime, 'challenge-guardian');
  runtime.dispatch({
    type: 'BATTLE_ACTION',
    playthroughId: runtime.getState().gameplay.playthroughId,
    expectedRevision: runtime.getState().gameplay.revision,
    encounterInstanceId: runtime.getState().gameplay.encounter!.instanceId,
    intent: { type: 'move', participantId: 'hero-seat', destination: { x: 2, y: 2 } },
  });
  return runtime;
}

function snapshot(runtime: GardenRuntime): GardenSaveSnapshot {
  const state = runtime.getState();
  return {
    mapId: state.mapId,
    anchorId: state.anchorId,
    narrative: state.narrative,
    gameplay: state.gameplay,
  };
}

describe('Garden coordinated package save adapter', () => {
  it('round-trips a committed map, active quest, narrative facts and gameplay inventory', () => {
    const runtime = gardenerSaveRuntime();
    const value = snapshot(runtime);
    const raw = encodeGardenSave(value, runtime.compiledNarrative, runtime.compiledGameplay);
    const decoded = decodeGardenSave(raw, runtime.compiledNarrative, runtime.compiledGameplay);

    expect(decoded).toMatchObject({ status: 'ready', snapshot: value });
    if (decoded.status === 'ready') {
      expect(decoded.snapshot.mapId).toBe('garden');
      expect(decoded.snapshot.anchorId).toBe('garden-village-gate');
      expect(decoded.snapshot.narrative.quests['gardener-quest']).toBe('active');
      expect(decoded.snapshot.narrative.facts['seed-found']).toBe(true);
      expect(decoded.snapshot.gameplay.inventory['special-seed']).toBe(1);
      expect(decoded.snapshot.gameplay.playthroughId).toBe('saved-garden');
    }
    const envelope = JSON.parse(raw) as { schemaVersion: number; gameplay: string };
    expect(envelope.schemaVersion).toBe(2);
    expect(JSON.parse(envelope.gameplay)).toMatchObject({ playthroughId: 'saved-garden' });
    runtime.dispose();
  });

  it('restores a validated scene and both package snapshots through the runtime command', () => {
    const source = gardenerSaveRuntime();
    const value = snapshot(source);
    const runtime = createGardenRuntime({ createPlaythroughId: () => 'restore-target' });
    runtime.dispatch({ type: 'RESTORE_GAME', ...value });

    expect(runtime.getState()).toMatchObject({
      phase: 'playing',
      mapId: 'garden',
      anchorId: 'garden-village-gate',
      walk: null,
      narrative: {
        playthroughId: 'saved-garden',
        facts: { 'story-path': 'gardener', 'seed-found': true },
        quests: { 'gardener-quest': 'active' },
      },
      gameplay: {
        playthroughId: 'saved-garden',
        inventory: { 'special-seed': 1 },
      },
    });
    const restored = runtime.getState();
    runtime.dispatch({ type: 'RESTORE_GAME', ...value, anchorId: 'village-square' as never });
    expect(runtime.getState()).toBe(restored);
    source.dispose();
    runtime.dispose();
  });

  it('preserves the active encounter across reload and accepts the next current-revision action', () => {
    const source = guardianCombatRuntime();
    const value = snapshot(source);
    const raw = encodeGardenSave(value, source.compiledNarrative, source.compiledGameplay);
    const decoded = decodeGardenSave(raw, source.compiledNarrative, source.compiledGameplay);
    expect(decoded.status).toBe('ready');
    if (decoded.status !== 'ready') return;

    const restored = createGardenRuntime({ createPlaythroughId: () => 'new-session' });
    restored.dispatch({ type: 'RESTORE_GAME', ...decoded.snapshot });
    expect(restored.getState().gameplay.encounter?.outcome).toBeNull();
    expect(restored.getState().gameplay.encounter?.round).toBe(2);
    expect(restored.getState().gameplay.encounter?.combatants[0]?.position).toEqual({ x: 2, y: 2 });
    const state = restored.getState();
    restored.dispatch({
      type: 'BATTLE_ACTION',
      playthroughId: state.gameplay.playthroughId,
      expectedRevision: state.gameplay.revision,
      encounterInstanceId: state.gameplay.encounter!.instanceId,
      intent: {
        type: 'use-ability',
        participantId: 'hero-seat',
        abilityId: 'gentle-ward',
        targetParticipantId: 'hero-seat',
      },
    });
    expect(restored.getState().gameplay.revision).toBeGreaterThan(state.gameplay.revision);
    expect(restored.getState().gameplay.encounter?.combatants[0]?.statuses).toEqual(
      expect.arrayContaining([expect.objectContaining({ statusEffectId: 'steady-glow' })]),
    );
    source.dispose();
    restored.dispose();
  });

  it('migrates version-one story saves into a gameplay snapshot without dropping story progress', () => {
    const runtime = gardenerSaveRuntime();
    const current = snapshot(runtime);
    const legacy = JSON.stringify({
      schemaVersion: 1,
      gameId: 'garden-adventure',
      contentVersion: '1.0.0',
      mapId: current.mapId,
      anchorId: current.anchorId,
      narrative: current.narrative,
    });
    const migrated = decodeGardenSave(legacy, runtime.compiledNarrative, runtime.compiledGameplay);
    expect(migrated).toMatchObject({ status: 'ready', migratedFrom: 1 });
    if (migrated.status === 'ready') {
      expect(migrated.snapshot.narrative.facts['seed-found']).toBe(true);
      expect(migrated.snapshot.gameplay.inventory['special-seed']).toBe(1);
      expect(migrated.snapshot.gameplay.appliedRewardIds).toContain('legacy-special-seed');
    }
    runtime.dispose();
  });

  it('uses an isolated namespace and preserves invalid bytes until explicit recovery', () => {
    const runtime = createGardenRuntime({ createPlaythroughId: () => 'save-inspect' });
    expect(GARDEN_SAVE_KEY).toBe('waypoint-rpg:garden-adventure:save');
    expect(
      inspectGardenSave(
        memoryStorage().storage,
        runtime.compiledNarrative,
        runtime.compiledGameplay,
      ),
    ).toEqual({ status: 'empty' });

    runtime.dispatch({ type: 'NEW_GAME' });
    for (const original of ['{broken', JSON.stringify({ schemaVersion: 11 })]) {
      const stored = memoryStorage(original);
      const result = inspectGardenSave(
        stored.storage,
        runtime.compiledNarrative,
        runtime.compiledGameplay,
      );
      expect(result.status).not.toBe('ready');
      expect(stored.read()).toBe(original);
    }
    expect(
      decodeGardenSave(
        JSON.stringify({ schemaVersion: 3 }),
        runtime.compiledNarrative,
        runtime.compiledGameplay,
      ),
    ).toEqual({ status: 'unsupported' });
    runtime.dispose();
  });

  it('rejects cross-map anchors, package identity mismatches, and incompatible definitions', () => {
    const runtime = gardenerSaveRuntime();
    const base = snapshot(runtime);
    const wrongAnchor = {
      ...base,
      anchorId: 'village-square' as GardenSaveSnapshot['anchorId'],
    };
    expect(() =>
      encodeGardenSave(wrongAnchor, runtime.compiledNarrative, runtime.compiledGameplay),
    ).toThrow('map and anchor do not match');

    const raw = encodeGardenSave(base, runtime.compiledNarrative, runtime.compiledGameplay);
    const envelope = JSON.parse(raw) as Record<string, unknown>;
    envelope.playthroughId = 'other-playthrough';
    expect(
      decodeGardenSave(
        JSON.stringify(envelope),
        runtime.compiledNarrative,
        runtime.compiledGameplay,
      ),
    ).toEqual({ status: 'corrupt' });

    const incompatibleNarrative = {
      ...base.narrative,
      compatibilityVersion: 'old-story-shape',
    };
    const incompatibleEnvelope = {
      ...JSON.parse(raw),
      narrative: incompatibleNarrative,
    };
    expect(
      decodeGardenSave(
        JSON.stringify(incompatibleEnvelope),
        runtime.compiledNarrative,
        runtime.compiledGameplay,
      ),
    ).toEqual({ status: 'incompatible' });
    runtime.dispose();
  });

  it('reports storage exceptions as unavailable', () => {
    const runtime = createGardenRuntime({ createPlaythroughId: () => 'save-unavailable' });
    const storage: GardenStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(inspectGardenSave(storage, runtime.compiledNarrative, runtime.compiledGameplay)).toEqual(
      { status: 'unavailable' },
    );
    runtime.dispose();
  });
});
