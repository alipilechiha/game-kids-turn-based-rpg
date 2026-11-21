/** JSON-compatible values accepted in authored facts and save snapshots. */
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export type PersistedQuestStatus = 'active' | 'completed' | 'failed' | 'cancelled';
export type QuestStatus = 'locked' | 'available' | PersistedQuestStatus;

export type NarrativeCondition =
  | { readonly op: 'flag'; readonly key: string; readonly equals: boolean }
  | { readonly op: 'eq'; readonly key: string; readonly value: JsonPrimitive }
  | { readonly op: 'neq'; readonly key: string; readonly value: JsonPrimitive }
  | {
      readonly op: 'int-gte' | 'int-gt' | 'int-lte' | 'int-lt';
      readonly key: string;
      readonly value: number;
    }
  | {
      readonly op: 'quest-status';
      readonly questId: string;
      readonly status: PersistedQuestStatus;
    }
  | { readonly op: 'all' | 'any'; readonly conditions: readonly NarrativeCondition[] }
  | { readonly op: 'not'; readonly condition: NarrativeCondition };

export type NarrativeEffect =
  | { readonly op: 'set-flag'; readonly key: string; readonly value: boolean }
  | { readonly op: 'clear-flag'; readonly key: string }
  | { readonly op: 'set-fact'; readonly key: string; readonly value: JsonValue }
  | { readonly op: 'increment-fact'; readonly key: string; readonly amount: number }
  | { readonly op: 'start-quest'; readonly questId: string }
  | { readonly op: 'complete-quest'; readonly questId: string }
  | { readonly op: 'fail-quest'; readonly questId: string }
  | { readonly op: 'cancel-quest'; readonly questId: string };

export type LocalizedText = Readonly<Record<string, string>>;

export interface DialogueChoiceDefinition {
  readonly id: string;
  readonly label: LocalizedText;
  readonly targetNodeId: string;
  readonly when?: NarrativeCondition;
  readonly effects?: readonly NarrativeEffect[];
  /** If true, the choice may be selected again at a later valid revision. */
  readonly repeatable?: boolean;
}

export interface DialogueNodeDefinition {
  readonly id: string;
  readonly speakerId: string;
  readonly text: LocalizedText;
  readonly when?: NarrativeCondition;
  readonly nextNodeId?: string;
  readonly choices?: readonly DialogueChoiceDefinition[];
  readonly terminal?: boolean;
  /** Required for a terminal node; immutable within its playthrough. */
  readonly endingId?: string;
  readonly cue?: string;
}

export interface DialogueDefinition {
  readonly id: string;
  readonly entryNodeId: string;
  readonly when?: NarrativeCondition;
  readonly exitPolicy: 'allowed' | 'forbidden';
  readonly nodes: readonly DialogueNodeDefinition[];
}

export interface QuestDefinition {
  readonly id: string;
  readonly prerequisites?: NarrativeCondition;
  /** Only failed or cancelled quests may restart, and only when opted in. */
  readonly restartable?: boolean;
}

export interface NarrativeTriggerDefinition {
  readonly id: string;
  readonly when?: NarrativeCondition;
  readonly effects: readonly NarrativeEffect[];
}

export interface NarrativeDefinition {
  readonly schemaVersion: 1;
  readonly id: string;
  /** Copy/presentation revision; it does not invalidate compatible progress. */
  readonly contentVersion: string;
  /** Explicit compatibility key for structural state/content changes. */
  readonly compatibilityVersion: string;
  readonly entryDialogueId: string;
  readonly dialogues: readonly DialogueDefinition[];
  readonly quests: readonly QuestDefinition[];
  readonly triggers?: readonly NarrativeTriggerDefinition[];
}

export interface NarrativeDiagnostic {
  readonly severity: 'error' | 'warning';
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface NarrativeValidationReport {
  readonly diagnostics: readonly NarrativeDiagnostic[];
  readonly errorCount: number;
  readonly warningCount: number;
  readonly ok: boolean;
}

/** Opaque compiled capability; mutable indexes are kept in a module WeakMap. */
export interface CompiledNarrative {
  readonly id: string;
  readonly schemaVersion: 1;
  readonly compatibilityVersion: string;
  readonly definition: NarrativeDefinition;
}
