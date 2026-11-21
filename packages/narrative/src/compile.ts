import type { CompiledNarrative, NarrativeDefinition } from './definition.js';
import { validateNarrative } from './validate.js';

interface Indexes {
  readonly dialogues: ReadonlyMap<string, NarrativeDefinition['dialogues'][number]>;
  readonly quests: ReadonlyMap<string, NarrativeDefinition['quests'][number]>;
  readonly triggers: ReadonlyMap<string, NonNullable<NarrativeDefinition['triggers']>[number]>;
}

const indexes = new WeakMap<CompiledNarrative, Indexes>();

export class NarrativeDefinitionError extends Error {
  constructor(readonly diagnostics: ReturnType<typeof validateNarrative>['diagnostics']) {
    super(
      `Narrative definition is invalid (${diagnostics.filter((item) => item.severity === 'error').length} errors).`,
    );
    this.name = 'NarrativeDefinitionError';
  }
}

function cloneJson<T>(value: T): T {
  if (Array.isArray(value)) return value.map((entry) => cloneJson(entry)) as T;
  if (value !== null && typeof value === 'object') {
    const copy: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) copy[key] = cloneJson(entry);
    return copy as T;
  }
  return value;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function compileNarrative(input: NarrativeDefinition): CompiledNarrative {
  const report = validateNarrative(input);
  if (!report.ok) throw new NarrativeDefinitionError(report.diagnostics);
  const definition = deepFreeze(cloneJson(input));
  const compiled: CompiledNarrative = Object.freeze({
    id: definition.id,
    schemaVersion: 1,
    compatibilityVersion: definition.compatibilityVersion,
    definition,
  });
  indexes.set(compiled, {
    dialogues: new Map(definition.dialogues.map((dialogue) => [dialogue.id, dialogue])),
    quests: new Map(definition.quests.map((quest) => [quest.id, quest])),
    triggers: new Map((definition.triggers ?? []).map((trigger) => [trigger.id, trigger])),
  });
  return compiled;
}

export function compiledIndexes(compiled: CompiledNarrative): Indexes {
  const result = indexes.get(compiled);
  if (!result) throw new TypeError('Expected a CompiledNarrative created by compileNarrative().');
  return result;
}
