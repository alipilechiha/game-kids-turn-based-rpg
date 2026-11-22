import { createGameRuntime, findPath, type AnchorId, type GameRuntime } from 'waypoint-rpg-core';
import {
  compileNarrative,
  createNarrativeState,
  type NarrativeDefinition,
  type NarrativeState,
  validateNarrative,
} from 'waypoint-rpg-narrative';
import { gardenNarrativeDefinition } from '../content/story.js';
import {
  gardenGraphs,
  gardenMaps,
  gardenMapName,
  getGardenTarget,
  mapTransitions,
  type GardenMapId,
  type GardenTargetId,
} from '../world/world.js';

export interface GardenWalk {
  readonly routeId: string;
  readonly path: readonly AnchorId[];
  readonly nextIndex: number;
}

export interface GardenState {
  readonly phase: 'title' | 'playing';
  readonly mapId: GardenMapId;
  readonly anchorId: AnchorId;
  readonly lastAnchorId: AnchorId | null;
  readonly walk: GardenWalk | null;
  readonly lastInteractionTarget: GardenTargetId | null;
  readonly narrative: NarrativeState;
}

export type GardenCommand =
  | { readonly type: 'NEW_GAME' }
  | { readonly type: 'MOVE_TO'; readonly targetId: GardenTargetId }
  | { readonly type: 'ARRIVE'; readonly routeId: string; readonly anchorId: AnchorId }
  | { readonly type: 'INTERACT'; readonly targetId: GardenTargetId };

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
  let generatedRoute = 0;
  const createPlaythroughId =
    options.createPlaythroughId ?? (() => `garden-${Date.now()}-${++generatedPlaythrough}`);

  const createNewGame = (): GardenState => ({
    phase: 'playing',
    mapId: 'village',
    anchorId: gardenMaps.village.spawnAnchorId,
    lastAnchorId: null,
    walk: null,
    lastInteractionTarget: null,
    narrative: createNarrativeState(compiledNarrative, createPlaythroughId()),
  });

  const runtime = createGameRuntime<GardenState, GardenCommand>({
    createInitialState: () => ({ ...createNewGame(), phase: 'title' }),
    reducer(state, command) {
      if (command.type === 'NEW_GAME') return createNewGame();
      if (state.phase !== 'playing') return state;

      if (command.type === 'MOVE_TO') {
        const target = getGardenTarget(command.targetId);
        if (!target || target.mapId !== state.mapId || state.walk) return state;
        const path = findPath(gardenGraphs[state.mapId], state.anchorId, target.anchorId);
        if (path.length < 2) return state;
        generatedRoute += 1;
        return {
          ...state,
          walk: { routeId: `route-${generatedRoute}`, path, nextIndex: 1 },
          lastInteractionTarget: null,
        };
      }

      if (command.type === 'ARRIVE') {
        const walk = state.walk;
        if (!walk || command.routeId !== walk.routeId) return state;
        const expectedAnchor = walk.path[walk.nextIndex];
        if (!expectedAnchor || command.anchorId !== expectedAnchor) return state;
        const nextIndex = walk.nextIndex + 1;
        return {
          ...state,
          anchorId: expectedAnchor,
          lastAnchorId: state.anchorId,
          walk: nextIndex === walk.path.length ? null : { ...walk, nextIndex },
        };
      }

      if (command.type === 'INTERACT') {
        const target = getGardenTarget(command.targetId);
        if (
          !target ||
          state.walk ||
          target.mapId !== state.mapId ||
          target.anchorId !== state.anchorId
        ) {
          return state;
        }

        const transition = mapTransitions.find(
          (candidate) =>
            candidate.fromMap === gardenMaps[state.mapId].id &&
            candidate.fromAnchor === state.anchorId &&
            candidate.fromAnchor === target.anchorId,
        );
        const nextMapId = transition ? gardenMapName(transition.toMap) : null;
        if (!transition || !nextMapId) {
          return { ...state, lastInteractionTarget: target.id };
        }

        return {
          ...state,
          mapId: nextMapId,
          anchorId: transition.toAnchor,
          lastAnchorId: null,
          walk: null,
          lastInteractionTarget: null,
        };
      }

      return state;
    },
  });

  return Object.assign(runtime, { compiledNarrative });
}
