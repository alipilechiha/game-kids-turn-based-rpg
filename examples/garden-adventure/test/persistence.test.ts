import {
  transitionNarrative,
  type NarrativeCommand,
  type NarrativeState,
} from 'waypoint-rpg-narrative';
import { describe, expect, it } from 'vitest';
import { createGardenRuntime } from '../src/game/runtime.js';
import {
  decodeGardenSave,
  encodeGardenSave,
  inspectGardenSave,
  GARDEN_SAVE_KEY,
  type GardenStorage,
  type GardenSaveSnapshot,
} from '../src/persistence/garden-save.js';

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

function progressedNarrative(): NarrativeState {
  const runtime = createGardenRuntime({ createPlaythroughId: () => 'saved-garden' });
  runtime.dispatch({ type: 'NEW_GAME' });
  let state = runtime.getState().narrative;
  const apply = (intent: NarrativeIntent<NarrativeCommand>) => {
    const result = transitionNarrative(runtime.compiledNarrative, state, {
      ...intent,
      playthroughId: state.playthroughId,
      expectedRevision: state.revision,
    } as NarrativeCommand);
    if (!result.accepted) throw new Error(result.reason.message);
    state = result.state;
  };
  apply({ type: 'open-dialogue', dialogueId: 'village-story' });
  apply({ type: 'choose', choiceId: 'listen-gardener' });
  apply({ type: 'choose', choiceId: 'help-gardener' });
  apply({ type: 'exit-dialogue' });
  apply({ type: 'trigger', triggerId: 'find-garden-seed' });
  runtime.dispose();
  return state;
}

type NarrativeIntent<T> = T extends NarrativeCommand
  ? Omit<T, 'playthroughId' | 'expectedRevision'>
  : never;

function snapshot(narrative = progressedNarrative()): GardenSaveSnapshot {
  return {
    mapId: 'garden',
    anchorId: 'garden-clue' as GardenSaveSnapshot['anchorId'],
    narrative,
  };
}

describe('Garden save adapter', () => {
  it('round-trips a validated map, anchor, active quest and narrative facts', () => {
    const runtime = createGardenRuntime({ createPlaythroughId: () => 'save-compiler' });
    const value = snapshot();
    const decoded = decodeGardenSave(encodeGardenSave(value), runtime.compiledNarrative);

    expect(decoded).toMatchObject({ status: 'ready', snapshot: value });
    if (decoded.status === 'ready') {
      expect(decoded.snapshot.mapId).toBe('garden');
      expect(decoded.snapshot.anchorId).toBe('garden-clue');
      expect(decoded.snapshot.narrative.quests['gardener-quest']).toBe('active');
      expect(decoded.snapshot.narrative.facts['seed-found']).toBe(true);
    }
    runtime.dispose();
  });

  it('restores a validated committed map and narrative snapshot through the runtime command', () => {
    const runtime = createGardenRuntime({ createPlaythroughId: () => 'restore-target' });
    const value = snapshot();
    runtime.dispatch({ type: 'RESTORE_GAME', ...value });

    expect(runtime.getState()).toMatchObject({
      phase: 'playing',
      mapId: 'garden',
      anchorId: 'garden-clue',
      walk: null,
      narrative: {
        playthroughId: 'saved-garden',
        facts: { 'story-path': 'gardener', 'seed-found': true },
        quests: { 'gardener-quest': 'active' },
      },
    });
    const restored = runtime.getState();
    runtime.dispatch({ type: 'RESTORE_GAME', ...value, anchorId: 'village-square' as never });
    expect(runtime.getState()).toBe(restored);
    runtime.dispose();
  });

  it('uses an isolated key and distinguishes empty, corrupt, unsupported and valid saves', () => {
    const runtime = createGardenRuntime({ createPlaythroughId: () => 'save-inspect' });
    const empty = memoryStorage();
    expect(inspectGardenSave(empty.storage, runtime.compiledNarrative)).toEqual({
      status: 'empty',
    });
    expect(GARDEN_SAVE_KEY).toBe('waypoint-rpg:garden-adventure:save');

    const corrupt = decodeGardenSave('{bad', runtime.compiledNarrative);
    expect(corrupt.status).toBe('corrupt');
    const future = decodeGardenSave(
      JSON.stringify({ schemaVersion: 2 }),
      runtime.compiledNarrative,
    );
    expect(future.status).toBe('unsupported');

    const valid = memoryStorage(encodeGardenSave(snapshot()));
    expect(inspectGardenSave(valid.storage, runtime.compiledNarrative).status).toBe('ready');
    runtime.dispose();
  });

  it('rejects anchors from another map and incompatible narrative snapshots', () => {
    const runtime = createGardenRuntime({ createPlaythroughId: () => 'save-validation' });
    const base = snapshot();
    const wrongAnchor = encodeGardenSave({ ...base, anchorId: 'village-square' as never });
    expect(decodeGardenSave(wrongAnchor, runtime.compiledNarrative).status).toBe('corrupt');

    const incompatible = {
      ...base,
      narrative: {
        ...base.narrative,
        compatibilityVersion: 'old-story-shape',
      },
    } as GardenSaveSnapshot;
    expect(decodeGardenSave(encodeGardenSave(incompatible), runtime.compiledNarrative).status).toBe(
      'incompatible',
    );
    runtime.dispose();
  });

  it('preserves corrupt or unsupported bytes until the player chooses recovery', () => {
    const runtime = createGardenRuntime({ createPlaythroughId: () => 'save-recovery' });
    for (const original of ['{broken', JSON.stringify({ schemaVersion: 11 })]) {
      const stored = memoryStorage(original);
      const result = inspectGardenSave(stored.storage, runtime.compiledNarrative);
      expect(result.status).not.toBe('ready');
      expect(stored.read()).toBe(original);
    }
    runtime.dispose();
  });

  it('reports unavailable storage without crashing boot inspection', () => {
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
    expect(inspectGardenSave(storage, runtime.compiledNarrative)).toEqual({
      status: 'unavailable',
    });
    runtime.dispose();
  });
});
