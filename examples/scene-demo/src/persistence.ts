import type { AnchorId, MapId } from 'waypoint-rpg-core';
import { decodeNarrativeState, type NarrativeState } from 'waypoint-rpg-narrative';
import { bloodLeafNarrative } from './content/blood-leaf.js';

export const DEMO_SAVE_KEY = 'waypoint-rpg-scene-demo:save';
const SAVE_SCHEMA_VERSION = 1;
const SAFE_ID = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/;

export interface DemoStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface DemoSaveValue {
  readonly contentVersion: string;
  readonly mapId: MapId;
  readonly entryAnchorId: AnchorId;
  readonly narrative: NarrativeState;
}

export type DemoSaveDecodeResult =
  | { readonly ok: true; readonly value: DemoSaveValue }
  | {
      readonly ok: false;
      readonly kind: 'corrupt' | 'unsupported' | 'incompatible';
      readonly message: string;
    };

interface DemoSaveEnvelope {
  readonly schemaVersion: number;
  readonly storyId: string;
  readonly contentVersion: string;
  readonly compatibilityVersion: string;
  readonly mapId: string;
  readonly entryAnchorId: string;
  readonly narrative: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function decodeFailure(
  kind: Exclude<DemoSaveDecodeResult, { readonly ok: true }>['kind'],
  message: string,
): DemoSaveDecodeResult {
  return { ok: false, kind, message };
}

export function encodeDemoSave(value: DemoSaveValue): string {
  const envelope: DemoSaveEnvelope = {
    schemaVersion: SAVE_SCHEMA_VERSION,
    storyId: bloodLeafNarrative.id,
    contentVersion: value.contentVersion,
    compatibilityVersion: bloodLeafNarrative.compatibilityVersion,
    mapId: value.mapId,
    entryAnchorId: value.entryAnchorId,
    narrative: value.narrative,
  };
  return JSON.stringify(envelope);
}

export function decodeDemoSave(raw: string): DemoSaveDecodeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return decodeFailure('corrupt', 'The stored save is not valid JSON.');
  }
  if (!isRecord(parsed)) return decodeFailure('corrupt', 'The save envelope must be an object.');
  if (!Number.isSafeInteger(parsed.schemaVersion)) {
    return decodeFailure('corrupt', 'The save envelope has no valid schema version.');
  }
  if (parsed.schemaVersion !== SAVE_SCHEMA_VERSION) {
    return decodeFailure('unsupported', `Unsupported save schema ${parsed.schemaVersion}.`);
  }

  const requiredStrings = [
    'storyId',
    'contentVersion',
    'compatibilityVersion',
    'mapId',
    'entryAnchorId',
  ] as const;
  if (
    requiredStrings.some(
      (key) => typeof parsed[key] !== 'string' || !SAFE_ID.test(parsed[key] as string),
    ) ||
    !Object.hasOwn(parsed, 'narrative')
  ) {
    return decodeFailure('corrupt', 'The save envelope contains invalid metadata.');
  }

  if (
    parsed.storyId !== bloodLeafNarrative.id ||
    parsed.compatibilityVersion !== bloodLeafNarrative.compatibilityVersion
  ) {
    return decodeFailure('incompatible', 'The save belongs to an incompatible story structure.');
  }

  const narrative = decodeNarrativeState(bloodLeafNarrative, parsed.narrative);
  if (!narrative.ok) {
    return decodeFailure(
      narrative.reason === 'incompatible-definition' || narrative.reason === 'story-mismatch'
        ? 'incompatible'
        : 'corrupt',
      narrative.message,
    );
  }

  return {
    ok: true,
    value: {
      contentVersion: parsed.contentVersion as string,
      mapId: parsed.mapId as MapId,
      entryAnchorId: parsed.entryAnchorId as AnchorId,
      narrative: narrative.state,
    },
  };
}

export const browserDemoStorage: DemoStorage = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
  removeItem: (key) => window.localStorage.removeItem(key),
};
