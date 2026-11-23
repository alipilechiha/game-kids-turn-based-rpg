import { describe, expect, it } from 'vitest';
import { createGardenRuntime, type GardenState } from '../src/game/runtime.js';
import {
  gardenSnapshotFingerprint,
  isGardenSceneReadyForState,
  shouldAutosaveGardenSnapshot,
} from '../src/persistence/garden-autosave.js';
import type { GardenSceneReadiness } from '../src/scenes/probe.js';
import { gardenGraphs } from '../src/world/world.js';

function createPlayingState() {
  const runtime = createGardenRuntime({ createPlaythroughId: () => 'autosave-test' });
  runtime.dispatch({ type: 'NEW_GAME' });
  return { runtime, state: runtime.getState() };
}

function readinessFor(state: GardenState): GardenSceneReadiness {
  return {
    mapId: state.mapId,
    anchorId: state.anchorId,
    playthroughId: state.narrative.playthroughId,
    cameraKind: 'orthographic',
    frameCount: 2,
    visibleMeshCount: 12,
    playerAtAnchor: true,
  };
}

describe('Garden autosave eligibility', () => {
  it('requires a changed durable snapshot and a usable matching scene', () => {
    const { runtime, state } = createPlayingState();
    const fingerprint = gardenSnapshotFingerprint(
      state,
      runtime.compiledNarrative,
      runtime.compiledGameplay,
    );
    const readiness = readinessFor(state);

    expect(isGardenSceneReadyForState(state, readiness)).toBe(true);
    expect(
      shouldAutosaveGardenSnapshot({
        state,
        readiness,
        storageMode: 'persistent',
        fingerprint,
        lastSavedFingerprint: null,
      }),
    ).toBe(true);
    expect(
      shouldAutosaveGardenSnapshot({
        state,
        readiness,
        storageMode: 'persistent',
        fingerprint,
        lastSavedFingerprint: fingerprint,
      }),
    ).toBe(false);
  });

  it('rejects title, in-flight, temporary, and mismatched-scene snapshots', () => {
    const { runtime, state } = createPlayingState();
    const fingerprint = gardenSnapshotFingerprint(
      state,
      runtime.compiledNarrative,
      runtime.compiledGameplay,
    );
    const readiness = readinessFor(state);
    const eligible = {
      state,
      readiness,
      storageMode: 'persistent' as const,
      fingerprint,
      lastSavedFingerprint: null,
    };

    expect(shouldAutosaveGardenSnapshot({ ...eligible, state: { ...state, phase: 'title' } })).toBe(
      false,
    );
    expect(
      shouldAutosaveGardenSnapshot({
        ...eligible,
        state: {
          ...state,
          walk: { routeId: 'route-1', path: [state.anchorId], nextIndex: 0 },
        },
      }),
    ).toBe(false);
    expect(shouldAutosaveGardenSnapshot({ ...eligible, storageMode: 'session-only' })).toBe(false);
    expect(
      shouldAutosaveGardenSnapshot({
        ...eligible,
        readiness: { ...readiness, playthroughId: 'stale-playthrough' },
      }),
    ).toBe(false);
    expect(
      shouldAutosaveGardenSnapshot({
        ...eligible,
        readiness: { ...readiness, cameraKind: 'unknown' },
      }),
    ).toBe(false);
    expect(
      shouldAutosaveGardenSnapshot({
        ...eligible,
        readiness: { ...readiness, playerAtAnchor: false },
      }),
    ).toBe(false);
  });

  it('fingerprints only durable package and location data', () => {
    const { runtime, state } = createPlayingState();
    const first = gardenSnapshotFingerprint(
      state,
      runtime.compiledNarrative,
      runtime.compiledGameplay,
    );
    runtime.dispatch({ type: 'DIALOGUE_EXIT' });
    const afterNoOp = gardenSnapshotFingerprint(
      runtime.getState(),
      runtime.compiledNarrative,
      runtime.compiledGameplay,
    );
    expect(afterNoOp).toBe(first);

    const otherAnchor = gardenGraphs.village.anchors.find((anchor) => anchor.id !== state.anchorId);
    expect(otherAnchor).toBeDefined();
    const movedState = { ...state, anchorId: otherAnchor!.id };
    expect(
      gardenSnapshotFingerprint(movedState, runtime.compiledNarrative, runtime.compiledGameplay),
    ).not.toBe(first);
  });
});
