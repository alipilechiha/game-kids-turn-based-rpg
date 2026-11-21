import type {
  ActiveDialogue,
  CompiledNarrative,
  DialogueView,
  JsonValue,
  NarrativeDecodeResult,
  NarrativeState,
  PersistedQuestStatus,
  QuestStatus,
} from './definition.js';
import { compiledIndexes } from './compile.js';
import { evaluateCondition } from './conditions.js';

const SAFE_ID = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/;
const SAFE_FACT_KEY = /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/;
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const PERSISTED_STATUSES = new Set<PersistedQuestStatus>([
  'active',
  'completed',
  'failed',
  'cancelled',
]);
const STATE_KEYS = new Set([
  'schemaVersion',
  'storyId',
  'compatibilityVersion',
  'playthroughId',
  'revision',
  'facts',
  'quests',
  'appliedChoiceIds',
  'appliedTriggerIds',
  'activeDialogue',
  'endingId',
]);

type Draft = {
  schemaVersion: 1;
  storyId: string;
  compatibilityVersion: string;
  playthroughId: string;
  revision: number;
  facts: Record<string, JsonValue>;
  quests: Record<string, PersistedQuestStatus>;
  appliedChoiceIds: string[];
  appliedTriggerIds: string[];
  activeDialogue: ActiveDialogue | null;
  endingId: string | null;
};

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cloneJson<T>(value: T): T {
  if (Array.isArray(value)) return value.map((entry) => cloneJson(entry)) as T;
  if (plainRecord(value)) {
    const copy: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) copy[key] = cloneJson(entry);
    return copy as T;
  }
  return value;
}

function freezeDeep<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

export function snapshotDraft(draft: Draft): NarrativeState {
  return freezeDeep(cloneJson(draft));
}

export function draftFromState(state: NarrativeState): Draft {
  return cloneJson(state) as Draft;
}

export function createNarrativeState(
  compiled: CompiledNarrative,
  playthroughId: string,
): NarrativeState {
  compiledIndexes(compiled);
  if (typeof playthroughId !== 'string' || !SAFE_ID.test(playthroughId)) {
    throw new TypeError('playthroughId must be a stable ASCII identifier.');
  }
  return snapshotDraft({
    schemaVersion: 1,
    storyId: compiled.id,
    compatibilityVersion: compiled.compatibilityVersion,
    playthroughId,
    revision: 0,
    facts: {},
    quests: {},
    appliedChoiceIds: [],
    appliedTriggerIds: [],
    activeDialogue: null,
    endingId: null,
  });
}

export function getFact(state: NarrativeState, key: string): JsonValue | undefined {
  return Object.hasOwn(state.facts, key) ? state.facts[key] : undefined;
}

export function getQuestStatus(
  compiled: CompiledNarrative,
  state: NarrativeState,
  questId: string,
): QuestStatus {
  const quest = compiledIndexes(compiled).quests.get(questId);
  if (!quest) throw new RangeError(`Unknown quest id: ${questId}.`);
  const persisted = state.quests[questId];
  if (persisted) return persisted;
  return quest.prerequisites && !evaluateCondition(quest.prerequisites, state)
    ? 'locked'
    : 'available';
}

export function getDialogueView(
  compiled: CompiledNarrative,
  state: NarrativeState,
  locale: string,
): DialogueView | null {
  const active = state.activeDialogue;
  if (!active) return null;
  const dialogue = compiledIndexes(compiled).dialogues.get(active.dialogueId);
  const node = dialogue?.nodes.find((candidate) => candidate.id === active.nodeId);
  if (!dialogue || !node || (node.when && !evaluateCondition(node.when, state))) return null;
  const choices = (node.choices ?? []).map((choice) => ({
    id: choice.id,
    label: localized(choice.label, locale),
    available:
      (!choice.when || evaluateCondition(choice.when, state)) &&
      (choice.repeatable === true || !state.appliedChoiceIds.includes(choice.id)),
  }));
  return Object.freeze({
    dialogueId: dialogue.id,
    nodeId: node.id,
    speakerId: node.speakerId,
    text: localized(node.text, locale),
    terminal: node.terminal === true,
    exitAllowed: dialogue.exitPolicy === 'allowed',
    choices: Object.freeze(choices.map((choice) => Object.freeze(choice))),
  });
}

function localized(values: Readonly<Record<string, string>>, locale: string): string {
  if (values[locale]) return values[locale]!;
  const language = locale.split('-')[0];
  if (values[language!]) return values[language!]!;
  const fallback = Object.keys(values).sort()[0];
  return fallback ? values[fallback]! : '';
}

export function decodeNarrativeState(
  compiled: CompiledNarrative,
  input: unknown,
): NarrativeDecodeResult {
  const indexes = compiledIndexes(compiled);
  if (
    !plainRecord(input) ||
    !validJson(input) ||
    Object.keys(input).some((key) => !STATE_KEYS.has(key)) ||
    Object.keys(input).length !== STATE_KEYS.size
  ) {
    return decodeFailure(
      'invalid-payload',
      'Narrative save must be an object with the supported fields only.',
    );
  }
  if (input.schemaVersion !== 1)
    return decodeFailure('unsupported-schema', 'Narrative save schema is unsupported.');
  if (input.storyId !== compiled.id)
    return decodeFailure('story-mismatch', 'Narrative save belongs to another story.');
  if (input.compatibilityVersion !== compiled.compatibilityVersion) {
    return decodeFailure(
      'incompatible-definition',
      'Narrative content changed incompatibly; the saved bytes must be preserved for recovery.',
    );
  }
  if (
    typeof input.playthroughId !== 'string' ||
    !SAFE_ID.test(input.playthroughId) ||
    !Number.isSafeInteger(input.revision) ||
    (input.revision as number) < 0
  ) {
    return decodeFailure('invalid-payload', 'Playthrough id or revision is invalid.');
  }
  if (
    !plainRecord(input.facts) ||
    !plainRecord(input.quests) ||
    !Array.isArray(input.appliedChoiceIds) ||
    !Array.isArray(input.appliedTriggerIds)
  ) {
    return decodeFailure(
      'invalid-payload',
      'Facts, quest states, and applied event ids have invalid shapes.',
    );
  }
  const facts: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(input.facts)) {
    if (!SAFE_FACT_KEY.test(key) || UNSAFE_KEYS.has(key) || !validJson(value))
      return decodeFailure('invalid-payload', `Fact ${key} is not safe JSON.`);
    facts[key] = cloneJson(value) as JsonValue;
  }
  const quests: Record<string, PersistedQuestStatus> = {};
  for (const [questId, status] of Object.entries(input.quests)) {
    if (
      !indexes.quests.has(questId) ||
      typeof status !== 'string' ||
      !PERSISTED_STATUSES.has(status as PersistedQuestStatus)
    ) {
      return decodeFailure('invalid-payload', `Quest state ${questId} is unknown or invalid.`);
    }
    quests[questId] = status as PersistedQuestStatus;
  }
  const allChoices = new Set<string>();
  for (const dialogue of compiled.definition.dialogues)
    for (const node of dialogue.nodes)
      for (const choice of node.choices ?? []) allChoices.add(choice.id);
  const appliedChoiceIds: string[] = [];
  for (const choiceId of input.appliedChoiceIds) {
    if (
      typeof choiceId !== 'string' ||
      !allChoices.has(choiceId) ||
      appliedChoiceIds.includes(choiceId)
    ) {
      return decodeFailure(
        'invalid-payload',
        `Applied choice id ${String(choiceId)} is unknown or duplicated.`,
      );
    }
    appliedChoiceIds.push(choiceId);
  }
  const triggerIds = new Set((compiled.definition.triggers ?? []).map((trigger) => trigger.id));
  const appliedTriggerIds: string[] = [];
  for (const triggerId of input.appliedTriggerIds) {
    if (
      typeof triggerId !== 'string' ||
      !triggerIds.has(triggerId) ||
      appliedTriggerIds.includes(triggerId)
    ) {
      return decodeFailure(
        'invalid-payload',
        `Applied trigger id ${String(triggerId)} is unknown or duplicated.`,
      );
    }
    appliedTriggerIds.push(triggerId);
  }
  let activeDialogue: ActiveDialogue | null = null;
  if (input.activeDialogue !== null) {
    if (
      !plainRecord(input.activeDialogue) ||
      Object.keys(input.activeDialogue).sort().join('\0') !==
        ['dialogueId', 'nodeId'].sort().join('\0') ||
      typeof input.activeDialogue.dialogueId !== 'string' ||
      typeof input.activeDialogue.nodeId !== 'string'
    ) {
      return decodeFailure('invalid-payload', 'Active dialogue pointer is invalid.');
    }
    const dialogue = indexes.dialogues.get(input.activeDialogue.dialogueId);
    const activeNodeId = input.activeDialogue.nodeId;
    const node = dialogue?.nodes.find((candidate) => candidate.id === activeNodeId);
    if (!dialogue || !node)
      return decodeFailure('invalid-payload', 'Active dialogue pointer refers to missing content.');
    activeDialogue = { dialogueId: dialogue.id, nodeId: node.id };
  }
  if (
    input.endingId !== null &&
    (typeof input.endingId !== 'string' ||
      !compiled.definition.dialogues.some((dialogue) =>
        dialogue.nodes.some((node) => node.terminal && node.endingId === input.endingId),
      ))
  ) {
    return decodeFailure('invalid-payload', 'Ending id is not defined by this story.');
  }
  if (input.endingId !== null && activeDialogue !== null)
    return decodeFailure(
      'invalid-payload',
      'A finished playthrough cannot have an active dialogue.',
    );
  const state = snapshotDraft({
    schemaVersion: 1,
    storyId: compiled.id,
    compatibilityVersion: compiled.compatibilityVersion,
    playthroughId: input.playthroughId,
    revision: input.revision as number,
    facts,
    quests,
    appliedChoiceIds,
    appliedTriggerIds,
    activeDialogue,
    endingId: input.endingId as string | null,
  });
  if (activeDialogue) {
    const dialogue = indexes.dialogues.get(activeDialogue.dialogueId)!;
    const node = dialogue.nodes.find((candidate) => candidate.id === activeDialogue!.nodeId)!;
    if (
      (dialogue.when && !evaluateCondition(dialogue.when, state)) ||
      (node.when && !evaluateCondition(node.when, state))
    ) {
      return decodeFailure(
        'invalid-payload',
        'Saved dialogue is no longer eligible under its story conditions.',
      );
    }
  }
  return { ok: true, state };
}

function validJson(value: unknown, seen = new Set<object>(), depth = 0): boolean {
  if (depth > 32) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  let valid = true;
  if (Array.isArray(value)) {
    if (
      Object.getPrototypeOf(value) !== Array.prototype ||
      Object.getOwnPropertySymbols(value).length
    )
      valid = false;
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (
        !descriptor ||
        !descriptor.enumerable ||
        !('value' in descriptor) ||
        !validJson(descriptor.value, seen, depth + 1)
      )
        valid = false;
    }
    const keys = Reflect.ownKeys(value).filter((key) => key !== 'length');
    if (
      keys.length !== value.length ||
      keys.some(
        (key) =>
          typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length,
      )
    )
      valid = false;
  } else if (plainRecord(value)) {
    if (Object.getOwnPropertySymbols(value).length) valid = false;
    for (const rawKey of Reflect.ownKeys(value)) {
      if (typeof rawKey !== 'string') continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, rawKey);
      if (
        UNSAFE_KEYS.has(rawKey) ||
        !descriptor?.enumerable ||
        !('value' in descriptor) ||
        !validJson(descriptor.value, seen, depth + 1)
      )
        valid = false;
    }
  } else valid = false;
  seen.delete(value);
  return valid;
}

function decodeFailure(
  reason: Exclude<NarrativeDecodeResult, { readonly ok: true }>['reason'],
  message: string,
): NarrativeDecodeResult {
  return { ok: false, reason, message };
}
