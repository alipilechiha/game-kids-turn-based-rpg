import type { AnchorId } from 'waypoint-rpg-core';
import {
  decodeNarrativeState,
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
}

export type GardenSaveInspection =
  | { readonly status: 'empty' }
  | { readonly status: 'ready'; readonly snapshot: GardenSaveSnapshot }
  | { readonly status: 'corrupt' | 'incompatible' | 'unsupported' | 'unavailable' };

interface GardenSaveEnvelope {
  readonly schemaVersion: 1;
  readonly gameId: 'garden-adventure';
  readonly contentVersion: string;
  readonly mapId: GardenMapId;
  readonly anchorId: string;
  readonly narrative: unknown;
}

const envelopeKeys = [
  'anchorId',
  'contentVersion',
  'gameId',
  'mapId',
  'narrative',
  'schemaVersion',
].sort();

export function encodeGardenSave(snapshot: GardenSaveSnapshot): string {
  const envelope: GardenSaveEnvelope = {
    schemaVersion: 1,
    gameId: 'garden-adventure',
    contentVersion: '1.0.0',
    mapId: snapshot.mapId,
    anchorId: snapshot.anchorId,
    narrative: snapshot.narrative,
  };
  return JSON.stringify(envelope);
}

export function decodeGardenSave(raw: string, compiled: CompiledNarrative): GardenSaveInspection {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 'corrupt' };
  }
  if (!isRecord(parsed)) return { status: 'corrupt' };
  if (parsed.schemaVersion !== 1) {
    return Number.isSafeInteger(parsed.schemaVersion)
      ? { status: 'unsupported' }
      : { status: 'corrupt' };
  }
  if (
    Object.keys(parsed).sort().join('\0') !== envelopeKeys.join('\0') ||
    parsed.gameId !== 'garden-adventure' ||
    typeof parsed.contentVersion !== 'string' ||
    (parsed.mapId !== 'village' && parsed.mapId !== 'garden') ||
    typeof parsed.anchorId !== 'string'
  ) {
    return { status: 'corrupt' };
  }

  const mapId = parsed.mapId as GardenMapId;
  if (!gardenGraphs[mapId].anchors.some((anchor) => anchor.id === parsed.anchorId))
    return { status: 'corrupt' };

  const narrative = decodeNarrativeState(compiled, parsed.narrative);
  if (!narrative.ok) {
    if (narrative.reason === 'incompatible-definition') return { status: 'incompatible' };
    if (narrative.reason === 'unsupported-schema') return { status: 'unsupported' };
    return { status: 'corrupt' };
  }
  return {
    status: 'ready',
    snapshot: {
      mapId,
      anchorId: parsed.anchorId as AnchorId,
      narrative: narrative.state,
    },
  };
}

export function inspectGardenSave(
  storage: GardenStorage,
  compiled: CompiledNarrative,
): GardenSaveInspection {
  let raw: string | null;
  try {
    raw = storage.getItem(GARDEN_SAVE_KEY);
  } catch {
    return { status: 'unavailable' };
  }
  return raw === null ? { status: 'empty' } : decodeGardenSave(raw, compiled);
}

export function writeGardenSave(storage: GardenStorage, snapshot: GardenSaveSnapshot): void {
  storage.setItem(GARDEN_SAVE_KEY, encodeGardenSave(snapshot));
}

export function removeGardenSave(storage: GardenStorage): void {
  storage.removeItem(GARDEN_SAVE_KEY);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
