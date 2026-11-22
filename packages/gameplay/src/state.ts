import type { CompiledGameplay, GameplayAttributeDefinition, GameplayState } from './definition.js';
import { assertCompiledGameplay } from './compile.js';
import { snapshotGameplayState } from './internal.js';

const SAFE_ID = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/;

export function createGameplayState(
  compiled: CompiledGameplay,
  playthroughId: string,
): GameplayState {
  assertCompiledGameplay(compiled);
  if (typeof playthroughId !== 'string' || !SAFE_ID.test(playthroughId))
    throw new TypeError('playthroughId must be a stable ASCII identifier.');
  const characterProgress: Record<string, { experience: number }> = {};
  for (const character of compiled.definition.characters)
    characterProgress[character.id] = { experience: 0 };
  return snapshotGameplayState({
    schemaVersion: 1,
    definitionId: compiled.id,
    compatibilityVersion: compiled.compatibilityVersion,
    playthroughId,
    revision: 0,
    characterProgress,
    inventory: {},
    equipment: {},
    encounter: null,
    appliedRewardIds: [],
    outcomeMarkers: [],
  });
}

export function getCharacterLevel(
  compiled: CompiledGameplay,
  state: GameplayState,
  characterId: string,
): number {
  assertCompiledGameplay(compiled);
  const progress = state.characterProgress[characterId];
  if (
    !compiled.definition.characters.some((character) => character.id === characterId) ||
    !progress
  )
    throw new RangeError(`Unknown character id: ${characterId}.`);
  if (!Number.isSafeInteger(progress.experience) || progress.experience < 0)
    throw new TypeError(`Experience for ${characterId} is invalid.`);
  let level = 1;
  for (const threshold of compiled.definition.progression.experienceThresholds) {
    if (progress.experience < threshold) break;
    level += 1;
  }
  return Math.min(level, compiled.definition.progression.maxLevel);
}

export function getUnlockedAbilityIds(
  compiled: CompiledGameplay,
  state: GameplayState,
  characterId: string,
): readonly string[] {
  const character = compiled.definition.characters.find((item) => item.id === characterId);
  if (!character) throw new RangeError(`Unknown character id: ${characterId}.`);
  const level = getCharacterLevel(compiled, state, characterId);
  const ids = new Set(character.startingAbilityIds ?? []);
  for (const unlock of compiled.definition.progression.abilityUnlocks ?? [])
    if (unlock.level <= level) ids.add(unlock.abilityId);
  return Object.freeze([...ids]);
}

/** Recompute base plus equipped modifiers and clamp to authored attribute bounds. */
export function getCharacterAttributes(
  compiled: CompiledGameplay,
  state: GameplayState,
  characterId: string,
  excludingSlotId?: string,
): Readonly<Record<string, number>> {
  assertCompiledGameplay(compiled);
  const character = compiled.definition.characters.find((item) => item.id === characterId);
  if (!character) throw new RangeError(`Unknown character id: ${characterId}.`);
  const totals: Record<string, number> = { ...character.baseAttributes };
  const equipped = state.equipment[characterId] ?? {};
  for (const [slotId, itemId] of Object.entries(equipped)) {
    if (slotId === excludingSlotId) continue;
    const item = compiled.definition.items.find((candidate) => candidate.id === itemId);
    for (const modifier of item?.equipment?.modifiers ?? []) {
      const sum = totals[modifier.attributeId]! + modifier.amount;
      if (!Number.isSafeInteger(sum))
        throw new RangeError('Derived attribute exceeds safe integer bounds.');
      totals[modifier.attributeId] = sum;
    }
  }
  for (const [attributeId, value] of Object.entries(totals)) {
    const definition = compiled.definition.attributes.find((item) => item.id === attributeId)!;
    totals[attributeId] = clamp(value, definition);
  }
  return Object.freeze(totals);
}

export function getInventorySlotCount(compiled: CompiledGameplay, state: GameplayState): number {
  assertCompiledGameplay(compiled);
  let slots = 0;
  for (const [itemId, quantity] of Object.entries(state.inventory)) {
    const item = compiled.definition.items.find((candidate) => candidate.id === itemId);
    if (!item || !Number.isSafeInteger(quantity) || quantity < 0)
      throw new TypeError(`Inventory entry ${itemId} is invalid.`);
    if (quantity > 0) {
      slots += Math.ceil(quantity / item.stackLimit);
      if (!Number.isSafeInteger(slots))
        throw new RangeError('Inventory stack count exceeds safe integer bounds.');
    }
  }
  return slots;
}

export function clamp(value: number, definition: GameplayAttributeDefinition): number {
  return Math.min(definition.maximum, Math.max(definition.minimum, value));
}
