import { createGameRuntime, type GameRuntime } from 'waypoint-rpg-core';
import {
  compileNarrative,
  createNarrativeState,
  type NarrativeDefinition,
  type NarrativeState,
  validateNarrative,
} from 'waypoint-rpg-narrative';
import { gardenNarrativeDefinition } from '../content/story.js';

export interface GardenState {
  readonly phase: 'title' | 'playing';
  readonly mapId: 'village' | 'garden';
  readonly anchorId: string;
  readonly narrative: NarrativeState;
}

export type GardenCommand = { readonly type: 'NEW_GAME' };

export interface GardenRuntime extends GameRuntime<GardenState, GardenCommand> {
  readonly compiledNarrative: ReturnType<typeof compileNarrative>;
}

export interface GardenRuntimeOptions {
  readonly createPlaythroughId?: () => string;
  readonly definition?: NarrativeDefinition;
}

function compileDefinition(definition: NarrativeDefinition) {
  const validation = validateNarrative(definition);
  if (!validation.ok) {
    throw new Error(
      validation.diagnostics
        .filter((diagnostic) => diagnostic.severity === 'error')
        .map((diagnostic) => `${diagnostic.path}: ${diagnostic.message}`)
        .join('\n'),
    );
  }
  return compileNarrative(definition);
}

export function createGardenRuntime(options: GardenRuntimeOptions = {}): GardenRuntime {
  const compiledNarrative = compileDefinition(options.definition ?? gardenNarrativeDefinition);
  let generatedPlaythrough = 0;
  const createPlaythroughId =
    options.createPlaythroughId ?? (() => `garden-${Date.now()}-${++generatedPlaythrough}`);

  const initialState = (): GardenState => ({
    phase: 'title',
    mapId: 'village',
    anchorId: 'village-gate',
    narrative: createNarrativeState(compiledNarrative, createPlaythroughId()),
  });

  const runtime = createGameRuntime<GardenState, GardenCommand>({
    createInitialState: initialState,
    reducer(state, command) {
      if (command.type === 'NEW_GAME') {
        return {
          phase: 'playing',
          mapId: 'village',
          anchorId: 'village-gate',
          narrative: createNarrativeState(compiledNarrative, createPlaythroughId()),
        };
      }
      return state;
    },
  });

  return Object.assign(runtime, { compiledNarrative });
}
