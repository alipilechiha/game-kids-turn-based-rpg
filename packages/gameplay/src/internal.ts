import type {
  GameplayRejectionCode,
  GameplayState,
  GameplayTransitionResult,
} from './definition.js';

export type GameplayDraft = {
  schemaVersion: 1;
  definitionId: string;
  compatibilityVersion: string;
  playthroughId: string;
  revision: number;
  characterProgress: Record<string, { experience: number }>;
  inventory: Record<string, number>;
  equipment: Record<string, Record<string, string>>;
  encounter: GameplayState['encounter'];
  appliedRewardIds: string[];
  outcomeMarkers: GameplayState['outcomeMarkers'];
};

export function cloneGameplayValue<T>(value: T): T {
  if (Array.isArray(value)) return value.map((child) => cloneGameplayValue(child)) as T;
  if (value !== null && typeof value === 'object') {
    const copy: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) copy[key] = cloneGameplayValue(child);
    return copy as T;
  }
  return value;
}

export function freezeGameplayValue<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeGameplayValue(child);
    Object.freeze(value);
  }
  return value;
}

export function snapshotGameplayState(draft: GameplayDraft): GameplayState {
  return freezeGameplayValue(cloneGameplayValue(draft));
}

export function rejectGameplay(
  state: GameplayState,
  code: GameplayRejectionCode,
  message: string,
): GameplayTransitionResult {
  return { accepted: false, state, reason: { code, message } };
}

export function finishGameplay(
  original: GameplayState,
  draft: GameplayDraft,
  change: string,
): GameplayTransitionResult {
  if (!Number.isSafeInteger(original.revision) || original.revision < 0)
    return rejectGameplay(original, 'invalid-transition', 'State revision is invalid.');
  if (original.revision >= Number.MAX_SAFE_INTEGER)
    return rejectGameplay(
      original,
      'revision-overflow',
      'Gameplay revision cannot advance safely.',
    );
  draft.revision = original.revision + 1;
  return { accepted: true, state: snapshotGameplayState(draft), change };
}
