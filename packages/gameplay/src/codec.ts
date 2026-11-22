import type { CompiledGameplay, GameplayOutcome, GameplayState } from './definition.js';
import { assertCompiledGameplay } from './compile.js';
import { cloneGameplayValue, freezeGameplayValue, type GameplayDraft } from './internal.js';
import { getCharacterAttributes, getInventorySlotCount, getUnlockedAbilityIds } from './state.js';

const SAFE_ID = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/;
const STATE_KEYS = [
  'schemaVersion',
  'definitionId',
  'compatibilityVersion',
  'playthroughId',
  'revision',
  'characterProgress',
  'inventory',
  'equipment',
  'encounter',
  'appliedRewardIds',
  'outcomeMarkers',
];
const OUTCOMES = new Set<GameplayOutcome>(['victory', 'defeat', 'turn-limit', 'withdrawn']);

export type GameplayStateDecodeFailureCode =
  'invalid-state' | 'unsupported-schema' | 'incompatible-definition';

export type GameplayStateDecodeResult =
  | { readonly ok: true; readonly state: GameplayState }
  | {
      readonly ok: false;
      readonly reason: {
        readonly code: GameplayStateDecodeFailureCode;
        readonly path: string;
        readonly message: string;
      };
    };

export class GameplayStateCodecError extends TypeError {
  constructor(
    readonly code: GameplayStateDecodeFailureCode,
    readonly path: string,
    message: string,
  ) {
    super(message);
    this.name = 'GameplayStateCodecError';
  }
}

/** Validate, defensively copy, and deeply freeze a persisted gameplay snapshot. */
export function decodeGameplayState(
  compiled: CompiledGameplay,
  input: unknown,
): GameplayStateDecodeResult {
  assertCompiledGameplay(compiled);
  try {
    if (!isJsonValue(input))
      return invalid('$', 'Gameplay state must contain only finite JSON values and plain objects.');
    if (!isRecord(input)) return invalid('$', 'Gameplay state must be an object.');
    if (!hasExactKeys(input, STATE_KEYS))
      return invalid('$', 'Gameplay state has missing or unknown top-level fields.');
    if (input.schemaVersion !== 1) {
      if (Number.isSafeInteger(input.schemaVersion))
        return failed(
          'unsupported-schema',
          '$.schemaVersion',
          'Gameplay state schema version is not supported.',
        );
      return invalid('$.schemaVersion', 'Gameplay state schema version must be an integer.');
    }
    if (input.definitionId !== compiled.id)
      return failed(
        'incompatible-definition',
        '$.definitionId',
        'Gameplay state belongs to another definition.',
      );
    if (input.compatibilityVersion !== compiled.compatibilityVersion)
      return failed(
        'incompatible-definition',
        '$.compatibilityVersion',
        'Gameplay state is structurally incompatible with this definition.',
      );
    if (!isSafeId(input.playthroughId))
      return invalid('$.playthroughId', 'Playthrough ID is invalid.');
    if (!isNonNegativeSafeInteger(input.revision))
      return invalid('$.revision', 'Gameplay revision must be a non-negative safe integer.');
    if (!validateCharacterProgress(compiled, input.characterProgress))
      return invalid('$.characterProgress', 'Character progress does not match the definition.');
    if (!validateInventory(compiled, input.inventory))
      return invalid('$.inventory', 'Inventory contains an unknown item or invalid quantity.');
    if (!validateEquipment(compiled, input.equipment, input.inventory, input.characterProgress))
      return invalid('$.equipment', 'Equipment ownership, slot, or requirement is invalid.');
    if (!validateRewardIds(input.appliedRewardIds))
      return invalid('$.appliedRewardIds', 'Applied reward IDs must be unique safe identifiers.');
    if (!validateOutcomeMarkers(compiled, input.outcomeMarkers))
      return invalid('$.outcomeMarkers', 'Outcome markers are invalid or duplicated.');
    if (
      !validateEncounter(
        compiled,
        input.encounter,
        input.revision,
        input.outcomeMarkers,
        input.characterProgress,
        input.equipment,
        input.appliedRewardIds,
      )
    )
      return invalid('$.encounter', 'Encounter state does not match a valid combat snapshot.');

    const copy = cloneGameplayValue(input) as GameplayDraft;
    return { ok: true, state: freezeGameplayValue(copy) as GameplayState };
  } catch {
    return invalid('$', 'Gameplay state could not be safely inspected.');
  }
}

/** Return canonical JSON for a compatible snapshot; object keys are sorted recursively. */
export function encodeGameplayState(compiled: CompiledGameplay, state: GameplayState): string {
  const decoded = decodeGameplayState(compiled, state);
  if (!decoded.ok)
    throw new GameplayStateCodecError(
      decoded.reason.code,
      decoded.reason.path,
      decoded.reason.message,
    );
  return stableStringify(decoded.state);
}

function validateCharacterProgress(compiled: CompiledGameplay, value: unknown): boolean {
  if (!isSafeRecord(value)) return false;
  const ids = compiled.definition.characters.map((character) => character.id);
  if (!sameSet(Object.keys(value), ids)) return false;
  return ids.every((id) => {
    const progress = value[id];
    return (
      isRecord(progress) &&
      hasExactKeys(progress, ['experience']) &&
      isNonNegativeSafeInteger(progress.experience)
    );
  });
}

function validateInventory(compiled: CompiledGameplay, value: unknown): boolean {
  if (!isSafeRecord(value)) return false;
  const items = new Map(compiled.definition.items.map((item) => [item.id, item]));
  for (const [itemId, quantity] of Object.entries(value)) {
    const item = items.get(itemId);
    if (!item || !isPositiveSafeInteger(quantity)) return false;
    if (item.unique && quantity !== 1) return false;
  }
  try {
    const count = getInventorySlotCount(compiled, {
      inventory: value,
    } as GameplayState);
    return compiled.definition.inventoryCapacity === undefined
      ? true
      : count <= compiled.definition.inventoryCapacity;
  } catch {
    return false;
  }
}

function validateEquipment(
  compiled: CompiledGameplay,
  value: unknown,
  inventory: unknown,
  characterProgress: unknown,
): boolean {
  if (!isSafeRecord(value) || !isSafeRecord(inventory) || !isSafeRecord(characterProgress))
    return false;
  const characters = new Set(compiled.definition.characters.map((character) => character.id));
  const slots = new Set(compiled.definition.equipmentSlots.map((slot) => slot.id));
  const items = new Map(compiled.definition.items.map((item) => [item.id, item]));
  const equippedCounts = new Map<string, number>();
  for (const [characterId, equipped] of Object.entries(value)) {
    if (!characters.has(characterId) || !isSafeRecord(equipped)) return false;
    for (const [slotId, itemId] of Object.entries(equipped)) {
      if (typeof itemId !== 'string') return false;
      const item = items.get(itemId);
      if (
        !slots.has(slotId) ||
        !item ||
        item.equipment?.slotId !== slotId ||
        !isPositiveSafeInteger(inventory[itemId])
      )
        return false;
      equippedCounts.set(itemId, (equippedCounts.get(itemId) ?? 0) + 1);
    }
  }
  for (const [itemId, count] of equippedCounts) {
    if ((inventory[itemId] as number) < count) return false;
  }
  const state = {
    characterProgress,
    inventory,
    equipment: value,
  } as GameplayState;
  try {
    for (const [characterId, equipped] of Object.entries(value)) {
      for (const [slotId, itemId] of Object.entries(equipped as Record<string, unknown>)) {
        if (typeof itemId !== 'string') return false;
        const item = items.get(itemId)!;
        const attributes = getCharacterAttributes(compiled, state, characterId, slotId);
        if (
          (item.equipment?.requirements ?? []).some(
            (requirement) =>
              (attributes[requirement.attributeId] ?? Number.MIN_SAFE_INTEGER) <
              requirement.minimum,
          )
        )
          return false;
      }
    }
  } catch {
    return false;
  }
  return true;
}

function validateRewardIds(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isSafeId) && new Set(value).size === value.length;
}

function validateOutcomeMarkers(
  compiled: CompiledGameplay,
  value: unknown,
): value is GameplayState['outcomeMarkers'] {
  if (!Array.isArray(value)) return false;
  const instances = new Set<string>();
  for (const marker of value) {
    if (
      !isRecord(marker) ||
      !hasExactKeys(marker, ['encounterInstanceId', 'outcome', 'consequenceId']) ||
      !isSafeInstanceId(marker.encounterInstanceId) ||
      !OUTCOMES.has(marker.outcome as GameplayOutcome) ||
      !isSafeId(marker.consequenceId) ||
      instances.has(marker.encounterInstanceId)
    )
      return false;
    const mapped = compiled.definition.encounters.some(
      (encounter) =>
        (marker.outcome !== 'withdrawn' || encounter.allowWithdrawal) &&
        encounter.outcomeMappings.some(
          (mapping) =>
            mapping.outcome === marker.outcome && mapping.consequenceId === marker.consequenceId,
        ),
    );
    if (!mapped) return false;
    instances.add(marker.encounterInstanceId);
  }
  return true;
}

function validateEncounter(
  compiled: CompiledGameplay,
  value: unknown,
  revision: number,
  markers: unknown,
  characterProgress: unknown,
  equipment: unknown,
  appliedRewardIds: unknown,
): boolean {
  if (value === null) return true;
  if (
    !isRecord(value) ||
    !isRecord(characterProgress) ||
    !Array.isArray(markers) ||
    !Array.isArray(appliedRewardIds)
  )
    return false;
  if (
    !hasExactKeys(value, [
      'instanceId',
      'definitionId',
      'round',
      'activeParticipantId',
      'combatants',
      'outcome',
    ]) ||
    !isSafeInstanceId(value.instanceId) ||
    !isSafeId(value.definitionId) ||
    !isPositiveSafeInteger(value.round) ||
    !isSafeId(value.activeParticipantId) ||
    !(value.outcome === null || OUTCOMES.has(value.outcome as GameplayOutcome)) ||
    !Array.isArray(value.combatants)
  )
    return false;
  const definition = compiled.definition.encounters.find((item) => item.id === value.definitionId);
  if (!definition || value.round > definition.maxTurns) return false;
  const board = compiled.definition.boards.find((item) => item.id === definition.boardId);
  if (!board || value.combatants.length !== definition.participants.length) return false;
  const expected = new Map(
    definition.participants.map((participant) => [participant.id, participant]),
  );
  const seen = new Set<string>();
  const occupied = new Set<string>();
  let activeIsAlive = false;
  let playerAlive = false;
  let enemyAlive = false;
  for (const combatant of value.combatants) {
    if (
      !isRecord(combatant) ||
      !hasExactKeys(combatant, [
        'id',
        'characterId',
        'team',
        'position',
        'resources',
        'statuses',
        'cooldowns',
        'completedTurns',
      ]) ||
      !isSafeId(combatant.id) ||
      seen.has(combatant.id)
    )
      return false;
    const participant = expected.get(combatant.id);
    if (
      !participant ||
      participant.characterId !== combatant.characterId ||
      participant.team !== combatant.team
    )
      return false;
    if (!validateCell(combatant.position, board)) return false;
    const cellId = String(combatant.position.x) + ',' + String(combatant.position.y);
    if (occupied.has(cellId)) return false;
    occupied.add(cellId);
    if (
      !validateResources(compiled, combatant.resources) ||
      !validateStatuses(compiled, combatant.statuses, revision) ||
      !validateCooldowns(compiled, combatant, characterProgress, equipment) ||
      !isNonNegativeSafeInteger(combatant.completedTurns) ||
      combatant.completedTurns > value.round
    )
      return false;
    if (
      combatant.id === value.activeParticipantId &&
      (combatant.resources as Record<string, number>)[compiled.definition.healthResourceId]! > 0
    )
      activeIsAlive = true;
    const alive =
      (combatant.resources as Record<string, number>)[compiled.definition.healthResourceId]! > 0;
    if (alive && combatant.team === 'player') playerAlive = true;
    if (alive && combatant.team === 'enemy') enemyAlive = true;
    seen.add(combatant.id);
  }
  if (seen.size !== expected.size) return false;
  if (!seen.has(value.activeParticipantId)) return false;
  if (value.outcome === null) {
    if (!activeIsAlive || !playerAlive || !enemyAlive) return false;
    if (
      markers.some((marker) => isRecord(marker) && marker.encounterInstanceId === value.instanceId)
    )
      return false;
    if (appliedRewardIds.includes(victoryRewardId(value.instanceId))) return false;
    return true;
  }
  if (
    (value.outcome === 'victory' && enemyAlive) ||
    (value.outcome === 'defeat' && (playerAlive || !enemyAlive)) ||
    (value.outcome === 'turn-limit' &&
      (value.round !== definition.maxTurns || !playerAlive || !enemyAlive)) ||
    (value.outcome === 'withdrawn' && (!definition.allowWithdrawal || !playerAlive || !enemyAlive))
  )
    return false;
  const marker = markers.find(
    (entry) => isRecord(entry) && entry.encounterInstanceId === value.instanceId,
  );
  if (!isRecord(marker) || marker.outcome !== value.outcome) return false;
  if (
    value.outcome === 'victory' &&
    definition.victoryRewards !== undefined &&
    !appliedRewardIds.includes(victoryRewardId(value.instanceId))
  )
    return false;
  return definition.outcomeMappings.some(
    (mapping) =>
      mapping.outcome === value.outcome && mapping.consequenceId === marker.consequenceId,
  );
}

function validateResources(compiled: CompiledGameplay, value: unknown): boolean {
  if (!isSafeRecord(value)) return false;
  const resources = compiled.definition.resources;
  if (
    !sameSet(
      Object.keys(value),
      resources.map((resource) => resource.id),
    )
  )
    return false;
  return resources.every((resource) => {
    const amount = value[resource.id];
    return isNonNegativeSafeInteger(amount) && (amount as number) <= resource.maximum;
  });
}

function validateStatuses(compiled: CompiledGameplay, value: unknown, revision: number): boolean {
  if (!Array.isArray(value)) return false;
  const definitions = new Map(
    compiled.definition.statusEffects.map((status) => [status.id, status]),
  );
  const seen = new Set<string>();
  for (const status of value) {
    if (
      !isRecord(status) ||
      !hasExactKeys(status, ['statusEffectId', 'remainingHolderTurns', 'appliedAtRevision']) ||
      !isSafeId(status.statusEffectId) ||
      seen.has(status.statusEffectId) ||
      !isPositiveSafeInteger(status.remainingHolderTurns) ||
      !isNonNegativeSafeInteger(status.appliedAtRevision) ||
      status.appliedAtRevision > revision
    )
      return false;
    const definition = definitions.get(status.statusEffectId);
    if (!definition || status.remainingHolderTurns > definition.durationTurns) return false;
    seen.add(status.statusEffectId);
  }
  return true;
}

function validateCooldowns(
  compiled: CompiledGameplay,
  combatant: Record<string, unknown>,
  characterProgress: Record<string, unknown>,
  equipment: unknown,
): boolean {
  const cooldowns = combatant.cooldowns;
  if (!isSafeRecord(cooldowns)) return false;
  const abilities = new Map(compiled.definition.abilities.map((ability) => [ability.id, ability]));
  for (const [abilityId, remaining] of Object.entries(cooldowns)) {
    const ability = abilities.get(abilityId);
    if (
      !ability ||
      !ability.cooldownTurns ||
      !isPositiveSafeInteger(remaining) ||
      remaining > ability.cooldownTurns
    )
      return false;
  }
  const character = compiled.definition.characters.find(
    (item) => item.id === combatant.characterId,
  );
  if (!character || !characterProgress[character.id]) return false;
  const unlocked = new Set(
    getUnlockedAbilityIds(compiled, { characterProgress } as GameplayState, character.id),
  );
  if (isSafeRecord(equipment) && isSafeRecord(equipment[character.id])) {
    for (const itemId of Object.values(equipment[character.id] as Record<string, unknown>)) {
      if (typeof itemId !== 'string') return false;
      const item = compiled.definition.items.find((candidate) => candidate.id === itemId);
      for (const abilityId of item?.equipment?.grantedAbilityIds ?? []) unlocked.add(abilityId);
    }
  }
  if (Object.keys(cooldowns).some((abilityId) => !unlocked.has(abilityId))) return false;
  return true;
}

function validateCell(
  value: unknown,
  board: {
    readonly width: number;
    readonly height: number;
    readonly blockedCells: readonly { x: number; y: number }[];
  },
): value is { readonly x: number; readonly y: number } {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['x', 'y']) ||
    !isNonNegativeSafeInteger(value.x) ||
    !isNonNegativeSafeInteger(value.y) ||
    value.x >= board.width ||
    value.y >= board.height
  )
    return false;
  return !board.blockedCells.some((cell) => cell.x === value.x && cell.y === value.y);
}

function sameSet(actual: string[], expected: string[]): boolean {
  return actual.length === expected.length && expected.every((item) => actual.includes(item));
}

function hasExactKeys(value: Record<string, unknown>, required: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === required.length && required.every((key) => Object.hasOwn(value, key));
}

function isJsonValue(value: unknown, ancestors = new Set<object>()): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object') return false;
  if (ancestors.has(value)) return false;
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (
        Object.getPrototypeOf(value) !== Array.prototype ||
        Object.getOwnPropertySymbols(value).length > 0
      )
        return false;
      const keys = Object.keys(value);
      if (
        keys.length !== value.length ||
        keys.some((key, index) => key !== String(index)) ||
        Object.getOwnPropertyNames(value).length !== value.length + 1
      )
        return false;
      const descriptors = Object.getOwnPropertyDescriptors(value);
      return Array.from({ length: value.length }, (_, index) => descriptors[String(index)]).every(
        (descriptor) =>
          descriptor !== undefined &&
          'value' in descriptor &&
          descriptor.enumerable &&
          isJsonValue(descriptor.value, ancestors),
      );
    }
    const prototype = Object.getPrototypeOf(value);
    if (
      (prototype !== Object.prototype && prototype !== null) ||
      Object.getOwnPropertySymbols(value).length > 0
    )
      return false;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    return Object.entries(descriptors).every(
      ([key, descriptor]) =>
        !['__proto__', 'prototype', 'constructor'].includes(key) &&
        descriptor.enumerable &&
        'value' in descriptor &&
        isJsonValue(descriptor.value, ancestors),
    );
  } finally {
    ancestors.delete(value);
  }
}

function isSafeRecord(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && Object.keys(value).every((key) => isSafeId(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSafeId(value: unknown): value is string {
  return typeof value === 'string' && SAFE_ID.test(value);
}

function isSafeInstanceId(value: unknown): value is string {
  return isSafeId(value) && value.length <= 110;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function invalid(path: string, message: string): GameplayStateDecodeResult {
  return failed('invalid-state', path, message);
}

function failed(
  code: GameplayStateDecodeFailureCode,
  path: string,
  message: string,
): GameplayStateDecodeResult {
  return { ok: false, reason: { code, path, message } };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map((item) => stableStringify(item)).join(',') + ']';
  if (isRecord(value)) {
    const properties = Object.keys(value)
      .sort()
      .map((key) => JSON.stringify(key) + ':' + stableStringify(value[key]));
    return '{' + properties.join(',') + '}';
  }
  const result = JSON.stringify(value);
  if (result === undefined) throw new TypeError('Gameplay state is not JSON serializable.');
  return result;
}

function victoryRewardId(instanceId: string): string {
  return 'encounter:' + instanceId + ':victory';
}
