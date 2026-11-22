import type {
  CompiledGameplay,
  GameplayGrantCommand,
  GameplayRejectionCode,
  GameplayState,
} from './definition.js';
import type { GameplayDraft } from './internal.js';
import { getCharacterAttributes, getInventorySlotCount } from './state.js';

const SAFE_ID = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/;

export interface GameplayGrantFailure {
  readonly code: GameplayRejectionCode;
  readonly message: string;
}

/** Apply a validated reward bundle to a private candidate without publishing or revising it. */
export function applyGrantToDraft(
  compiled: CompiledGameplay,
  draft: GameplayDraft,
  grant: GameplayGrantCommand,
): GameplayGrantFailure | null {
  if (!isSafeId(grant.rewardId))
    return { code: 'invalid-command', message: 'Reward ID must be a stable identifier.' };
  if (draft.appliedRewardIds.includes(grant.rewardId))
    return {
      code: 'reward-already-applied',
      message: 'This reward was already applied in this playthrough.',
    };
  if (
    (grant.experience !== undefined && !Array.isArray(grant.experience)) ||
    (grant.items !== undefined && !Array.isArray(grant.items)) ||
    (grant.equipment !== undefined && !Array.isArray(grant.equipment))
  )
    return { code: 'invalid-command', message: 'Reward entries must be arrays.' };
  if (!hasEffects(grant))
    return {
      code: 'invalid-command',
      message: 'A reward grant must contain experience, items, or equipment.',
    };

  for (const row of grant.experience ?? []) {
    if (!isRecord(row) || !isSafeId(row.characterId))
      return { code: 'invalid-command', message: 'Experience reward entry is malformed.' };
    const progress = draft.characterProgress[row.characterId];
    if (!progress || !compiled.definition.characters.some((item) => item.id === row.characterId))
      return {
        code: 'unknown-character',
        message: 'Unknown character ' + String(row.characterId) + ' in experience grant.',
      };
    if (typeof row.amount !== 'number' || !Number.isSafeInteger(row.amount) || row.amount <= 0)
      return {
        code: 'invalid-quantity',
        message: 'Experience grants must be positive safe integers.',
      };
    const next = progress.experience + row.amount;
    if (!Number.isSafeInteger(next))
      return {
        code: 'invalid-quantity',
        message: 'Experience grant would exceed safe integer bounds.',
      };
    progress.experience = next;
  }

  const grantedItems = new Set<string>();
  for (const row of grant.items ?? []) {
    if (!isRecord(row) || !isSafeId(row.itemId))
      return { code: 'invalid-command', message: 'Item reward entry is malformed.' };
    const item = compiled.definition.items.find((candidate) => candidate.id === row.itemId);
    if (!item)
      return {
        code: 'unknown-item',
        message: 'Unknown item ' + String(row.itemId) + ' in reward grant.',
      };
    if (
      typeof row.quantity !== 'number' ||
      !Number.isSafeInteger(row.quantity) ||
      row.quantity <= 0
    )
      return {
        code: 'invalid-quantity',
        message: 'Item quantities must be positive safe integers.',
      };
    const next = (draft.inventory[item.id] ?? 0) + row.quantity;
    if (!Number.isSafeInteger(next))
      return {
        code: 'invalid-quantity',
        message: 'Quantity for ' + item.id + ' would exceed safe integer bounds.',
      };
    if (item.unique && next > 1)
      return {
        code: 'item-unavailable',
        message: 'Unique item ' + item.id + ' is already owned.',
      };
    draft.inventory[item.id] = next;
    grantedItems.add(item.id);
  }

  const assignedSlots = new Set<string>();
  for (const reward of grant.equipment ?? []) {
    if (
      !isRecord(reward) ||
      !isSafeId(reward.characterId) ||
      !isSafeId(reward.itemId) ||
      !isSafeId(reward.slotId)
    )
      return { code: 'invalid-command', message: 'Equipment reward entry is malformed.' };
    if (!compiled.definition.characters.some((item) => item.id === reward.characterId))
      return {
        code: 'unknown-character',
        message: 'Unknown character ' + String(reward.characterId) + ' in equipment grant.',
      };
    if (!compiled.definition.equipmentSlots.some((slot) => slot.id === reward.slotId))
      return {
        code: 'unknown-slot',
        message: 'Unknown equipment slot ' + String(reward.slotId) + '.',
      };
    const item = compiled.definition.items.find((candidate) => candidate.id === reward.itemId);
    if (!item)
      return {
        code: 'unknown-item',
        message: 'Unknown equipment item ' + String(reward.itemId) + '.',
      };
    if (!grantedItems.has(item.id) || (draft.inventory[item.id] ?? 0) < 1)
      return {
        code: 'item-unavailable',
        message: 'An equipment grant must include ownership in the same reward bundle.',
      };
    if (!item.equipment || item.equipment.slotId !== reward.slotId)
      return {
        code: 'equipment-ineligible',
        message: 'Item ' + item.id + ' is not compatible with slot ' + reward.slotId + '.',
      };
    const key = reward.characterId + ':' + reward.slotId;
    if (assignedSlots.has(key))
      return {
        code: 'invalid-command',
        message: 'A grant cannot assign one equipment slot more than once.',
      };
    assignedSlots.add(key);
    const attributes = getCharacterAttributes(
      compiled,
      draft as GameplayState,
      reward.characterId,
      reward.slotId,
    );
    if (
      (item.equipment.requirements ?? []).some(
        (requirement) =>
          (attributes[requirement.attributeId] ?? Number.MIN_SAFE_INTEGER) < requirement.minimum,
      )
    )
      return {
        code: 'equipment-ineligible',
        message:
          'Character ' +
          reward.characterId +
          ' does not meet the requirements for ' +
          item.id +
          '.',
      };
    (draft.equipment[reward.characterId] ??= {})[reward.slotId] = item.id;
  }

  const capacity = compiled.definition.inventoryCapacity;
  if (capacity !== undefined && getInventorySlotCount(compiled, draft as GameplayState) > capacity)
    return {
      code: 'inventory-capacity',
      message: 'The reward would exceed inventory capacity.',
    };

  draft.appliedRewardIds.push(grant.rewardId);
  return null;
}

function hasEffects(grant: GameplayGrantCommand): boolean {
  return Boolean(grant.experience?.length || grant.items?.length || grant.equipment?.length);
}

function isSafeId(value: unknown): value is string {
  return typeof value === 'string' && SAFE_ID.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
