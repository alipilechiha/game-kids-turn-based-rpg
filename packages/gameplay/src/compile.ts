import type { CompiledGameplay, GameplayDefinition } from './definition.js';
import { validateGameplay } from './validate.js';

const compiledInstances = new WeakSet<CompiledGameplay>();

export class GameplayDefinitionError extends Error {
  constructor(readonly diagnostics: ReturnType<typeof validateGameplay>['diagnostics']) {
    super(
      `Gameplay definition is invalid (${diagnostics.filter((item) => item.severity === 'error').length} errors).`,
    );
    this.name = 'GameplayDefinitionError';
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

/** Validate, defensively copy, and deeply freeze an authoring definition. */
export function compileGameplay(input: GameplayDefinition): CompiledGameplay {
  const validation = validateGameplay(input);
  if (!validation.ok) throw new GameplayDefinitionError(validation.diagnostics);
  const definition = deepFreeze(cloneJson(input));
  const compiled: CompiledGameplay = Object.freeze({
    id: definition.id,
    schemaVersion: 1,
    compatibilityVersion: definition.compatibilityVersion,
    definition,
  });
  compiledInstances.add(compiled);
  return compiled;
}

/** Internal authenticity check for later state-machine entry points. */
export function assertCompiledGameplay(value: CompiledGameplay): void {
  if (!compiledInstances.has(value))
    throw new TypeError('Expected a CompiledGameplay created by compileGameplay().');
}
