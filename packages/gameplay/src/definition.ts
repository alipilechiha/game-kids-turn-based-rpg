export type GameplayJsonPrimitive = string | number | boolean | null;
export type GameplayJsonValue =
  | GameplayJsonPrimitive
  | readonly GameplayJsonValue[]
  | { readonly [key: string]: GameplayJsonValue };

export type GameplayOutcome = 'victory' | 'defeat' | 'turn-limit' | 'withdrawn';
export type GameplayTeam = 'player' | 'enemy';
export type AbilityTargetKind = 'self' | 'ally' | 'enemy' | 'cell';

export interface GameplayAttributeDefinition {
  readonly id: string;
  readonly minimum: number;
  readonly maximum: number;
  readonly defaultValue: number;
}

export interface GameplayResourceDefinition {
  readonly id: string;
  readonly maximum: number;
  readonly defaultValue: number;
}

export interface GameplayProgressionDefinition {
  readonly maxLevel: number;
  /** Absolute lifetime experience threshold for each level after level one. */
  readonly experienceThresholds: readonly number[];
  readonly abilityUnlocks?: readonly {
    readonly level: number;
    readonly abilityId: string;
  }[];
}

export interface GameplayCharacterDefinition {
  readonly id: string;
  readonly baseAttributes: Readonly<Record<string, number>>;
  readonly startingResources?: Readonly<Record<string, number>>;
  readonly startingAbilityIds?: readonly string[];
}

export interface GameplayAttributeRequirement {
  readonly attributeId: string;
  readonly minimum: number;
}

export interface GameplayStatModifier {
  readonly attributeId: string;
  readonly amount: number;
}

export interface GameplayItemEquipmentDefinition {
  readonly slotId: string;
  readonly requirements?: readonly GameplayAttributeRequirement[];
  readonly modifiers?: readonly GameplayStatModifier[];
  readonly grantedAbilityIds?: readonly string[];
}

export interface GameplayItemDefinition {
  readonly id: string;
  readonly stackLimit: number;
  readonly unique?: boolean;
  readonly equipment?: GameplayItemEquipmentDefinition;
}

export interface GameplayEquipmentSlotDefinition {
  readonly id: string;
}

export interface GameplayAbilityTargetDefinition {
  readonly kind: AbilityTargetKind;
  readonly minimumRange: number;
  readonly maximumRange: number;
}

export type GameplayAbilityEffectDefinition =
  | { readonly op: 'damage' | 'heal'; readonly amount: number }
  | { readonly op: 'restore-resource'; readonly resourceId: string; readonly amount: number }
  | { readonly op: 'apply-status'; readonly statusEffectId: string };

export interface GameplayAbilityDefinition {
  readonly id: string;
  readonly resourceCosts: Readonly<Record<string, number>>;
  readonly target: GameplayAbilityTargetDefinition;
  readonly requirements?: readonly GameplayAttributeRequirement[];
  readonly effects: readonly GameplayAbilityEffectDefinition[];
  readonly cooldownTurns?: number;
}

export interface GameplayStatusEffectDefinition {
  readonly id: string;
  /** Number of subsequent completed turns belonging to the affected holder. */
  readonly durationTurns: number;
  readonly stackingPolicy: 'refresh' | 'ignore';
  readonly modifiers?: readonly GameplayStatModifier[];
}

export interface GameplayCell {
  readonly x: number;
  readonly y: number;
}

export interface GameplayBoardDefinition {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly blockedCells: readonly GameplayCell[];
}

export interface GameplayEncounterParticipantDefinition {
  readonly id: string;
  readonly characterId: string;
  readonly team: GameplayTeam;
  readonly position: GameplayCell;
  readonly initiative: number;
}

export interface GameplayRewardExperience {
  readonly characterId: string;
  readonly amount: number;
}

export interface GameplayRewardItem {
  readonly itemId: string;
  readonly quantity: number;
}

export interface GameplayRewardEquipment {
  readonly characterId: string;
  readonly itemId: string;
  readonly slotId: string;
}

export interface GameplayRewardBundle {
  readonly experience?: readonly GameplayRewardExperience[];
  readonly items?: readonly GameplayRewardItem[];
  readonly equipment?: readonly GameplayRewardEquipment[];
}

/** Consumer-owned consequence key; the gameplay package has no narrative dependency. */
export interface GameplayOutcomeMappingDefinition {
  readonly outcome: GameplayOutcome;
  readonly consequenceId: string;
}

export interface GameplayEncounterDefinition {
  /** Stable authored definition ID, reusable by many playthroughs. */
  readonly id: string;
  readonly boardId: string;
  readonly maxTurns: number;
  readonly allowWithdrawal: boolean;
  readonly participants: readonly GameplayEncounterParticipantDefinition[];
  readonly victoryRewards?: GameplayRewardBundle;
  /** Required unguarded outcome keys are resolved by the application adapter. */
  readonly outcomeMappings: readonly GameplayOutcomeMappingDefinition[];
}

export interface GameplayDefinition {
  readonly schemaVersion: 1;
  readonly id: string;
  /** Copy/authoring revision; does not invalidate compatible runtime state. */
  readonly contentVersion: string;
  /** Explicit structural compatibility key for saved gameplay state. */
  readonly compatibilityVersion: string;
  /** Optional capacity measured in occupied item stacks, not individual items. */
  readonly inventoryCapacity?: number;
  readonly attributes: readonly GameplayAttributeDefinition[];
  readonly resources: readonly GameplayResourceDefinition[];
  readonly progression: GameplayProgressionDefinition;
  readonly characters: readonly GameplayCharacterDefinition[];
  readonly items: readonly GameplayItemDefinition[];
  readonly equipmentSlots: readonly GameplayEquipmentSlotDefinition[];
  readonly abilities: readonly GameplayAbilityDefinition[];
  readonly statusEffects: readonly GameplayStatusEffectDefinition[];
  readonly boards: readonly GameplayBoardDefinition[];
  readonly encounters: readonly GameplayEncounterDefinition[];
}

export interface GameplayDiagnostic {
  readonly severity: 'error' | 'warning';
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface GameplayValidationReport {
  readonly diagnostics: readonly GameplayDiagnostic[];
  readonly errorCount: number;
  readonly warningCount: number;
  readonly ok: boolean;
}

/** Opaque compiled capability; its definition is a deeply frozen defensive copy. */
export interface CompiledGameplay {
  readonly id: string;
  readonly schemaVersion: 1;
  readonly compatibilityVersion: string;
  readonly definition: GameplayDefinition;
}

export interface GameplayCharacterProgressState {
  readonly experience: number;
}

export interface GameplayStatusInstance {
  readonly statusEffectId: string;
  readonly remainingHolderTurns: number;
}

export interface GameplayCombatantState {
  readonly id: string;
  readonly characterId: string;
  readonly team: GameplayTeam;
  readonly position: GameplayCell;
  readonly resources: Readonly<Record<string, number>>;
  readonly statuses: readonly GameplayStatusInstance[];
  readonly cooldowns: Readonly<Record<string, number>>;
}

export interface GameplayOutcomeMarker {
  readonly encounterInstanceId: string;
  readonly outcome: GameplayOutcome;
  readonly consequenceId: string;
}

export interface GameplayEncounterState {
  /** Unique within the owning playthrough; distinct from authored definition ID. */
  readonly instanceId: string;
  readonly definitionId: string;
  readonly round: number;
  readonly activeParticipantId: string;
  readonly combatants: readonly GameplayCombatantState[];
  readonly outcome: GameplayOutcome | null;
}

/** Durable package snapshot. Presentation and command correlation are application-owned. */
export interface GameplayState {
  readonly schemaVersion: 1;
  readonly definitionId: string;
  readonly compatibilityVersion: string;
  readonly playthroughId: string;
  readonly revision: number;
  readonly characterProgress: Readonly<Record<string, GameplayCharacterProgressState>>;
  readonly inventory: Readonly<Record<string, number>>;
  readonly equipment: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly encounter: GameplayEncounterState | null;
  readonly appliedRewardIds: readonly string[];
  readonly outcomeMarkers: readonly GameplayOutcomeMarker[];
}

export interface GameplayCommandBase {
  readonly playthroughId: string;
  readonly expectedRevision: number;
  readonly encounterInstanceId?: string;
}

/** Player-submitted intents only; enemy decisions and reward grants stay internal. */
export type GameplayPlayerIntent =
  | { readonly type: 'consume-item'; readonly itemId: string; readonly quantity: number }
  | {
      readonly type: 'equip-item';
      readonly characterId: string;
      readonly slotId: string;
      readonly itemId: string;
    }
  | { readonly type: 'unequip-item'; readonly characterId: string; readonly slotId: string }
  | { readonly type: 'start-encounter'; readonly encounterId: string; readonly instanceId: string }
  | { readonly type: 'move'; readonly participantId: string; readonly destination: GameplayCell }
  | {
      readonly type: 'use-ability';
      readonly participantId: string;
      readonly abilityId: string;
      readonly targetParticipantId?: string;
      readonly targetCell?: GameplayCell;
    }
  | { readonly type: 'wait'; readonly participantId: string }
  | { readonly type: 'withdraw' };

export type GameplayCommand = GameplayCommandBase & GameplayPlayerIntent;

/** Application-owned setup/reward grant. Never accept this as raw UI input. */
export interface GameplayGrantCommand {
  readonly playthroughId: string;
  readonly expectedRevision: number;
  /** Stable within this playthrough; the same grant cannot be applied twice. */
  readonly rewardId: string;
  readonly experience?: readonly GameplayRewardExperience[];
  readonly items?: readonly GameplayRewardItem[];
  readonly equipment?: readonly GameplayRewardEquipment[];
}

export type GameplayRejectionCode =
  | 'invalid-definition'
  | 'invalid-command'
  | 'wrong-playthrough'
  | 'stale-revision'
  | 'wrong-encounter-instance'
  | 'encounter-active'
  | 'encounter-inactive'
  | 'terminal-encounter'
  | 'invalid-turn'
  | 'unknown-character'
  | 'unknown-item'
  | 'unknown-slot'
  | 'invalid-quantity'
  | 'illegal-move'
  | 'illegal-target'
  | 'insufficient-resource'
  | 'ability-unavailable'
  | 'inventory-capacity'
  | 'item-unavailable'
  | 'equipment-ineligible'
  | 'reward-already-applied'
  | 'invalid-transition'
  | 'revision-overflow';

export type GameplayTransitionResult =
  | { readonly accepted: true; readonly state: GameplayState; readonly change: string }
  | {
      readonly accepted: false;
      readonly state: GameplayState;
      readonly reason: { readonly code: GameplayRejectionCode; readonly message: string };
    };
