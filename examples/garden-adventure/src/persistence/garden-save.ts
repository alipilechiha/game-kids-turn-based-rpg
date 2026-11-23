import type { AnchorId } from 'waypoint-rpg-core';
import {
  applyGameplayGrant,
  createGameplayState,
  decodeGameplayState,
  encodeGameplayState,
  type CompiledGameplay,
  type GameplayState,
} from 'waypoint-rpg-gameplay';
import {
  decodeNarrativeState,
  getFact,
  type CompiledNarrative,
  type NarrativeState,
} from 'waypoint-rpg-narrative';
import { gardenGraphs, type GardenMapId } from '../world/world.js';

export const GARDEN_SAVE_KEY = 'waypoint-rpg:garden-adventure:save';

export interface GardenStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface GardenSaveSnapshot {
  readonly mapId: GardenMapId;
  readonly anchorId: AnchorId;
  readonly narrative: NarrativeState;
  readonly gameplay: GameplayState;
}

export type GardenSaveInspection =
  | { readonly status: 'empty' }
  | {
      readonly status: 'ready';
      readonly snapshot: GardenSaveSnapshot;
      readonly migratedFrom?: 1;
    }
  | { readonly status: 'corrupt' | 'incompatible' | 'unsupported' | 'unavailable' };

interface GardenSaveEnvelopeV1 {
  readonly schemaVersion: 1;
  readonly gameId: 'garden-adventure';
  readonly contentVersion: string;
  readonly mapId: GardenMapId;
  readonly anchorId: string;
  readonly narrative: unknown;
}

interface GardenSaveEnvelopeV2 {
  readonly schemaVersion: 2;
  readonly gameId: 'garden-adventure';
  readonly contentVersion: string;
  readonly playthroughId: string;
  readonly mapId: GardenMapId;
  readonly anchorId: string;
  readonly narrative: NarrativeState;
  /** Canonical package encoding; the app never serializes package internals. */
  readonly gameplay: string;
}

const v1Keys = [
  'anchorId',
  'contentVersion',
  'gameId',
  'mapId',
  'narrative',
  'schemaVersion',
].sort();
const v2Keys = [
  'anchorId',
  'contentVersion',
  'gameId',
  'gameplay',
  'mapId',
  'narrative',
  'playthroughId',
  'schemaVersion',
].sort();

export function encodeGardenSave(
  snapshot: GardenSaveSnapshot,
  compiledNarrative: CompiledNarrative,
  compiledGameplay: CompiledGameplay,
): string {
  const narrative = decodeNarrativeState(compiledNarrative, snapshot.narrative);
  if (!narrative.ok) throw new TypeError(narrative.message);
  const gameplay = decodeGameplayState(compiledGameplay, snapshot.gameplay);
  if (!gameplay.ok) throw new TypeError(gameplay.reason.message);
  if (!isMapAnchor(snapshot.mapId, snapshot.anchorId))
    throw new TypeError('Garden save map and anchor do not match.');
  if (narrative.state.playthroughId !== gameplay.state.playthroughId)
    throw new TypeError('Garden save packages must share one playthrough identity.');
  if (!isConsistent(snapshot.mapId, narrative.state, gameplay.state))
    throw new TypeError('Garden save has inconsistent story and gameplay consequences.');

  const envelope: GardenSaveEnvelopeV2 = {
    schemaVersion: 2,
    gameId: 'garden-adventure',
    contentVersion: '2.0.0',
    playthroughId: narrative.state.playthroughId,
    mapId: snapshot.mapId,
    anchorId: snapshot.anchorId,
    narrative: narrative.state,
    gameplay: encodeGameplayState(compiledGameplay, gameplay.state),
  };
  return JSON.stringify(envelope);
}

export function decodeGardenSave(
  raw: string,
  compiledNarrative: CompiledNarrative,
  compiledGameplay: CompiledGameplay,
): GardenSaveInspection {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 'corrupt' };
  }
  if (!isRecord(parsed)) return { status: 'corrupt' };
  if (!Number.isSafeInteger(parsed.schemaVersion)) return { status: 'corrupt' };
  if (parsed.schemaVersion === 1)
    return decodeV1(parsed as unknown as GardenSaveEnvelopeV1, compiledNarrative, compiledGameplay);
  if (parsed.schemaVersion !== 2) return { status: 'unsupported' };
  if (
    Object.keys(parsed).sort().join('\0') !== v2Keys.join('\0') ||
    parsed.gameId !== 'garden-adventure' ||
    typeof parsed.contentVersion !== 'string' ||
    typeof parsed.playthroughId !== 'string' ||
    !isMapId(parsed.mapId) ||
    typeof parsed.anchorId !== 'string' ||
    typeof parsed.gameplay !== 'string'
  ) {
    return { status: 'corrupt' };
  }

  const mapId = parsed.mapId;
  if (!isMapAnchor(mapId, parsed.anchorId)) return { status: 'corrupt' };
  const narrative = decodeNarrativeState(compiledNarrative, parsed.narrative);
  if (!narrative.ok) return narrativeFailure(narrative.reason);

  let gameplayPayload: unknown;
  try {
    gameplayPayload = JSON.parse(parsed.gameplay);
  } catch {
    return { status: 'corrupt' };
  }
  const gameplay = decodeGameplayState(compiledGameplay, gameplayPayload);
  if (!gameplay.ok) {
    if (gameplay.reason.code === 'incompatible-definition') return { status: 'incompatible' };
    if (gameplay.reason.code === 'unsupported-schema') return { status: 'unsupported' };
    return { status: 'corrupt' };
  }
  if (
    parsed.playthroughId !== narrative.state.playthroughId ||
    parsed.playthroughId !== gameplay.state.playthroughId ||
    !isConsistent(mapId, narrative.state, gameplay.state)
  )
    return { status: 'corrupt' };

  return {
    status: 'ready',
    snapshot: {
      mapId,
      anchorId: parsed.anchorId as AnchorId,
      narrative: narrative.state,
      gameplay: gameplay.state,
    },
  };
}

export function inspectGardenSave(
  storage: GardenStorage,
  compiledNarrative: CompiledNarrative,
  compiledGameplay: CompiledGameplay,
): GardenSaveInspection {
  let raw: string | null;
  try {
    raw = storage.getItem(GARDEN_SAVE_KEY);
  } catch {
    return { status: 'unavailable' };
  }
  return raw === null
    ? { status: 'empty' }
    : decodeGardenSave(raw, compiledNarrative, compiledGameplay);
}

export function writeGardenSave(
  storage: GardenStorage,
  snapshot: GardenSaveSnapshot,
  compiledNarrative: CompiledNarrative,
  compiledGameplay: CompiledGameplay,
): void {
  storage.setItem(GARDEN_SAVE_KEY, encodeGardenSave(snapshot, compiledNarrative, compiledGameplay));
}

export function removeGardenSave(storage: GardenStorage): void {
  storage.removeItem(GARDEN_SAVE_KEY);
}

function decodeV1(
  parsed: GardenSaveEnvelopeV1,
  compiledNarrative: CompiledNarrative,
  compiledGameplay: CompiledGameplay,
): GardenSaveInspection {
  if (
    Object.keys(parsed).sort().join('\0') !== v1Keys.join('\0') ||
    parsed.gameId !== 'garden-adventure' ||
    typeof parsed.contentVersion !== 'string' ||
    !isMapId(parsed.mapId) ||
    typeof parsed.anchorId !== 'string'
  )
    return { status: 'corrupt' };
  if (!isMapAnchor(parsed.mapId, parsed.anchorId)) return { status: 'corrupt' };
  const narrative = decodeNarrativeState(compiledNarrative, parsed.narrative);
  if (!narrative.ok) return narrativeFailure(narrative.reason);

  let gameplay = createGameplayState(compiledGameplay, narrative.state.playthroughId);
  const seedFound = getFact(narrative.state, 'seed-found') === true;
  const treeGrown = getFact(narrative.state, 'tree-grown') === true;
  const lanternLit = getFact(narrative.state, 'lantern-lit') === true;
  if (seedFound && !treeGrown && !lanternLit) {
    const migrated = grantMigration(compiledGameplay, gameplay, 'legacy-special-seed', {
      items: [{ itemId: 'special-seed', quantity: 1 }],
    });
    if (!migrated) return { status: 'corrupt' };
    gameplay = migrated;
  }
  if (treeGrown || lanternLit) {
    const consequence = treeGrown ? 'legacy-gardener-ending' : 'legacy-lantern-ending';
    const migrated = grantMigration(compiledGameplay, gameplay, consequence, {
      experience: [{ characterId: 'garden-hero', amount: 24 }],
      items: [
        { itemId: 'garden-reward', quantity: 1 },
        { itemId: 'lantern-charm', quantity: 1 },
      ],
      equipment: [{ characterId: 'garden-hero', itemId: 'lantern-charm', slotId: 'charm' }],
    });
    if (!migrated) return { status: 'corrupt' };
    gameplay = migrated;
  }

  return {
    status: 'ready',
    migratedFrom: 1,
    snapshot: {
      mapId: parsed.mapId,
      anchorId: parsed.anchorId as AnchorId,
      narrative: narrative.state,
      gameplay,
    },
  };
}

function grantMigration(
  compiled: CompiledGameplay,
  state: GameplayState,
  rewardId: string,
  reward: {
    readonly experience?: readonly { readonly characterId: string; readonly amount: number }[];
    readonly items?: readonly { readonly itemId: string; readonly quantity: number }[];
    readonly equipment?: readonly {
      readonly characterId: string;
      readonly itemId: string;
      readonly slotId: string;
    }[];
  },
): GameplayState | null {
  const result = applyGameplayGrant(compiled, state, {
    playthroughId: state.playthroughId,
    expectedRevision: state.revision,
    rewardId,
    ...reward,
  });
  return result.accepted ? result.state : null;
}

function isConsistent(
  mapId: GardenMapId,
  narrative: NarrativeState,
  gameplay: GameplayState,
): boolean {
  const activeEncounter = gameplay.encounter?.outcome === null;
  if (activeEncounter && (mapId !== 'garden' || getFact(narrative, 'story-path') !== 'lantern'))
    return false;
  if (getFact(narrative, 'tree-grown') === true) {
    if (
      gameplay.inventory['special-seed'] !== undefined ||
      !gameplay.appliedRewardIds.some((id) =>
        ['garden-restoration', 'legacy-gardener-ending'].includes(id),
      ) ||
      gameplay.inventory['garden-reward'] !== 1 ||
      gameplay.inventory['lantern-charm'] !== 1
    )
      return false;
  }
  if (getFact(narrative, 'lantern-lit') === true) {
    const victory = gameplay.outcomeMarkers.find(
      (marker) => marker.consequenceId === 'guardian-victory' && marker.outcome === 'victory',
    );
    const migratedLegacyEnding = gameplay.appliedRewardIds.includes('legacy-lantern-ending');
    if (
      (!migratedLegacyEnding &&
        (!victory ||
          !gameplay.appliedRewardIds.includes(
            `encounter:${victory.encounterInstanceId}:victory`,
          ))) ||
      gameplay.inventory['garden-reward'] !== 1 ||
      gameplay.inventory['lantern-charm'] !== 1
    )
      return false;
  }
  if (narrative.endingId === 'ending-garden' && getFact(narrative, 'tree-grown') !== true)
    return false;
  if (narrative.endingId === 'ending-lantern' && getFact(narrative, 'lantern-lit') !== true)
    return false;
  return true;
}

function narrativeFailure(reason: string): GardenSaveInspection {
  if (reason === 'incompatible-definition' || reason === 'story-mismatch')
    return { status: 'incompatible' };
  if (reason === 'unsupported-schema') return { status: 'unsupported' };
  return { status: 'corrupt' };
}

function isMapId(value: unknown): value is GardenMapId {
  return value === 'village' || value === 'garden';
}

function isMapAnchor(mapId: GardenMapId, anchorId: string): boolean {
  return gardenGraphs[mapId].anchors.some((anchor) => anchor.id === anchorId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
