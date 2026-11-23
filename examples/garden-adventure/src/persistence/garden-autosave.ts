import type { CompiledGameplay } from 'waypoint-rpg-gameplay';
import type { CompiledNarrative } from 'waypoint-rpg-narrative';
import { encodeGardenSave, type GardenSaveSnapshot } from './garden-save.js';
import type { GardenState } from '../game/runtime.js';
import type { GardenSceneReadiness } from '../scenes/probe.js';

export function gardenSnapshotFingerprint(
  snapshot: GardenSaveSnapshot,
  compiledNarrative: CompiledNarrative,
  compiledGameplay: CompiledGameplay,
): string {
  return encodeGardenSave(snapshot, compiledNarrative, compiledGameplay);
}

export function isGardenSceneReadyForState(
  state: GardenState,
  readiness: GardenSceneReadiness | null,
): boolean {
  return Boolean(
    readiness &&
    readiness.mapId === state.mapId &&
    readiness.anchorId === state.anchorId &&
    readiness.playthroughId === state.narrative.playthroughId &&
    readiness.cameraKind === 'orthographic' &&
    readiness.frameCount >= 1 &&
    readiness.visibleMeshCount > 0 &&
    readiness.playerAtAnchor,
  );
}

export function shouldAutosaveGardenSnapshot({
  state,
  readiness,
  storageMode,
  fingerprint,
  lastSavedFingerprint,
}: {
  readonly state: GardenState;
  readonly readiness: GardenSceneReadiness | null;
  readonly storageMode: 'persistent' | 'session-only';
  readonly fingerprint: string;
  readonly lastSavedFingerprint: string | null;
}): boolean {
  return (
    state.phase === 'playing' &&
    state.walk === null &&
    storageMode === 'persistent' &&
    isGardenSceneReadyForState(state, readiness) &&
    fingerprint !== lastSavedFingerprint
  );
}
