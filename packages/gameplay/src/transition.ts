import type {
  CompiledGameplay,
  GameplayCommand,
  GameplayGrantCommand,
  GameplayState,
  GameplayTransitionResult,
} from './definition.js';
import { assertCompiledGameplay } from './compile.js';
import {
  cloneGameplayValue,
  finishGameplay,
  rejectGameplay,
  type GameplayDraft,
} from './internal.js';
import { getCharacterAttributes } from './state.js';
import { transitionCombat } from './combat.js';
import { applyGrantToDraft } from './rewards.js';

const SAFE_ID = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/;

/** Apply an application-owned, deduplicated setup/reward grant atomically. */
export function applyGameplayGrant(
  compiled: CompiledGameplay,
  state: GameplayState,
  grant: GameplayGrantCommand,
): GameplayTransitionResult {
  assertCompiledGameplay(compiled);
  const envelopeFailure = validateEnvelope(compiled, state, grant);
  if (envelopeFailure) return envelopeFailure;
  if (state.encounter?.outcome === null)
    return rejectGameplay(
      state,
      'encounter-active',
      'Rewards cannot be granted during an active encounter.',
    );
  const draft = cloneGameplayValue(state) as GameplayDraft;
  const failure = applyGrantToDraft(compiled, draft, grant);
  if (failure) return rejectGameplay(state, failure.code, failure.message);
  return finishGameplay(state, draft, 'reward');
}
/** Player state transition for equipment and inventory actions; combat is handled in P4.2b. */
export function transitionGameplay(
  compiled: CompiledGameplay,
  state: GameplayState,
  command: GameplayCommand,
): GameplayTransitionResult {
  assertCompiledGameplay(compiled);
  const envelopeFailure = validateEnvelope(compiled, state, command);
  if (envelopeFailure) return envelopeFailure;
  const combatResult = transitionCombat(compiled, state, command);
  if (combatResult) return combatResult;
  if (state.encounter?.outcome === null)
    return rejectGameplay(
      state,
      'encounter-active',
      'Inventory and equipment actions are unavailable during combat.',
    );
  const draft = cloneGameplayValue(state) as GameplayDraft;

  switch (command.type) {
    case 'consume-item': {
      if (!isSafeId(command.itemId))
        return rejectGameplay(state, 'unknown-item', 'Item ID is invalid.');
      const item = compiled.definition.items.find((candidate) => candidate.id === command.itemId);
      if (!item) return rejectGameplay(state, 'unknown-item', `Unknown item ${command.itemId}.`);
      if (!Number.isSafeInteger(command.quantity) || command.quantity <= 0)
        return rejectGameplay(
          state,
          'invalid-quantity',
          'Consumption quantity must be a positive safe integer.',
        );
      const current = draft.inventory[item.id] ?? 0;
      if (current < command.quantity)
        return rejectGameplay(state, 'item-unavailable', `Not enough ${item.id} is owned.`);
      const equippedCount = Object.values(draft.equipment).reduce(
        (count, slots) =>
          count + Object.values(slots).filter((equippedId) => equippedId === item.id).length,
        0,
      );
      const next = current - command.quantity;
      if (next < equippedCount)
        return rejectGameplay(state, 'item-unavailable', 'An equipped item cannot be consumed.');
      if (next === 0) delete draft.inventory[item.id];
      else draft.inventory[item.id] = next;
      return finishGameplay(state, draft, 'inventory');
    }
    case 'equip-item': {
      if (!isSafeId(command.characterId) || !draft.characterProgress[command.characterId])
        return rejectGameplay(
          state,
          'unknown-character',
          `Unknown character ${String(command.characterId)}.`,
        );
      if (
        !isSafeId(command.slotId) ||
        !compiled.definition.equipmentSlots.some((slot) => slot.id === command.slotId)
      )
        return rejectGameplay(
          state,
          'unknown-slot',
          `Unknown equipment slot ${String(command.slotId)}.`,
        );
      if (!isSafeId(command.itemId))
        return rejectGameplay(state, 'unknown-item', 'Item ID is invalid.');
      const item = compiled.definition.items.find((candidate) => candidate.id === command.itemId);
      if (!item) return rejectGameplay(state, 'unknown-item', `Unknown item ${command.itemId}.`);
      if ((draft.inventory[item.id] ?? 0) < 1)
        return rejectGameplay(state, 'item-unavailable', `Item ${item.id} is not owned.`);
      if (!item.equipment || item.equipment.slotId !== command.slotId)
        return rejectGameplay(
          state,
          'equipment-ineligible',
          `Item ${item.id} is not compatible with slot ${command.slotId}.`,
        );
      const attributes = getCharacterAttributes(
        compiled,
        state,
        command.characterId,
        command.slotId,
      );
      if (
        (item.equipment.requirements ?? []).some(
          (requirement) =>
            (attributes[requirement.attributeId] ?? Number.MIN_SAFE_INTEGER) < requirement.minimum,
        )
      )
        return rejectGameplay(
          state,
          'equipment-ineligible',
          `Character ${command.characterId} does not meet the requirements for ${item.id}.`,
        );
      (draft.equipment[command.characterId] ??= {})[command.slotId] = item.id;
      return finishGameplay(state, draft, 'equipment');
    }
    case 'unequip-item': {
      if (!isSafeId(command.characterId) || !draft.characterProgress[command.characterId])
        return rejectGameplay(
          state,
          'unknown-character',
          `Unknown character ${String(command.characterId)}.`,
        );
      if (
        !isSafeId(command.slotId) ||
        !compiled.definition.equipmentSlots.some((slot) => slot.id === command.slotId)
      )
        return rejectGameplay(
          state,
          'unknown-slot',
          `Unknown equipment slot ${String(command.slotId)}.`,
        );
      const slots = draft.equipment[command.characterId];
      if (!slots || !Object.hasOwn(slots, command.slotId))
        return rejectGameplay(
          state,
          'invalid-transition',
          `Slot ${command.slotId} is already empty.`,
        );
      delete slots[command.slotId];
      if (Object.keys(slots).length === 0) delete draft.equipment[command.characterId];
      return finishGameplay(state, draft, 'equipment');
    }
    default:
      return rejectGameplay(
        state,
        'invalid-transition',
        `Command ${String(command.type)} is not available in this gameplay phase.`,
      );
  }
}

function validateEnvelope(
  compiled: CompiledGameplay,
  state: GameplayState,
  command: Pick<GameplayCommand, 'playthroughId' | 'expectedRevision'> | GameplayGrantCommand,
): GameplayTransitionResult | null {
  if (!isRecord(state))
    return rejectGameplay(state, 'invalid-transition', 'Gameplay state is invalid.');
  if (
    state.definitionId !== compiled.id ||
    state.compatibilityVersion !== compiled.compatibilityVersion
  )
    return rejectGameplay(
      state,
      'invalid-definition',
      'Gameplay state is incompatible with this definition.',
    );
  if (!command || typeof command !== 'object')
    return rejectGameplay(state, 'invalid-command', 'Gameplay command must be an object.');
  if (!isSafeId(command.playthroughId) || command.playthroughId !== state.playthroughId)
    return rejectGameplay(state, 'wrong-playthrough', 'Command belongs to another playthrough.');
  if (
    !Number.isSafeInteger(command.expectedRevision) ||
    command.expectedRevision !== state.revision
  )
    return rejectGameplay(state, 'stale-revision', 'Command revision is stale.');
  if (!Number.isSafeInteger(state.revision) || state.revision < 0)
    return rejectGameplay(state, 'invalid-transition', 'Gameplay state revision is invalid.');
  if (state.revision >= Number.MAX_SAFE_INTEGER)
    return rejectGameplay(state, 'revision-overflow', 'Gameplay revision cannot advance safely.');
  return null;
}

function isSafeId(value: unknown): value is string {
  return typeof value === 'string' && SAFE_ID.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
