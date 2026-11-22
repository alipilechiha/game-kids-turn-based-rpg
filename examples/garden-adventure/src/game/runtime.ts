import { createGameRuntime, findPath, type AnchorId, type GameRuntime } from 'waypoint-rpg-core';
import {
  compileNarrative,
  createNarrativeState,
  decodeNarrativeState,
  transitionNarrative,
  type NarrativeDefinition,
  type NarrativeCommand,
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
  | {
      readonly type: 'RESTORE_GAME';
      readonly mapId: GardenMapId;
      readonly anchorId: AnchorId;
      readonly narrative: unknown;
    }
  | { readonly type: 'MOVE_TO'; readonly targetId: GardenTargetId }
  | { readonly type: 'ARRIVE'; readonly routeId: string; readonly anchorId: AnchorId }
  | { readonly type: 'INTERACT'; readonly targetId: GardenTargetId }
  | { readonly type: 'DIALOGUE_CHOICE'; readonly choiceId: string }
  | { readonly type: 'DIALOGUE_EXIT' };

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

type NarrativeIntent =
  | { readonly type: 'open-dialogue'; readonly dialogueId: string }
  | { readonly type: 'choose'; readonly choiceId: string }
  | { readonly type: 'exit-dialogue' }
  | { readonly type: 'advance' }
  | { readonly type: 'finish' }
  | { readonly type: 'trigger'; readonly triggerId: string };

function applyNarrativeIntent(
  compiled: ReturnType<typeof compileNarrative>,
  state: NarrativeState,
  intent: NarrativeIntent,
): NarrativeState {
  const result = transitionNarrative(compiled, state, {
    ...intent,
    playthroughId: state.playthroughId,
    expectedRevision: state.revision,
  } as NarrativeCommand);
  return result.accepted ? result.state : state;
}

function finishAvailableEnding(
  compiled: ReturnType<typeof compileNarrative>,
  state: NarrativeState,
): NarrativeState {
  const path = state.facts['story-path'];
  const expectedNode = path === 'gardener' ? 'gardener-wait' : 'traveler-wait';
  if (
    state.endingId ||
    state.activeDialogue ||
    state.suspendedDialogue?.dialogueId !== 'village-story' ||
    state.suspendedDialogue.nodeId !== expectedNode
  ) {
    return state;
  }

  const opened = transitionNarrative(compiled, state, {
    type: 'open-dialogue',
    dialogueId: 'village-story',
    playthroughId: state.playthroughId,
    expectedRevision: state.revision,
  });
  if (!opened.accepted) return state;
  const advanced = transitionNarrative(compiled, opened.state, {
    type: 'advance',
    playthroughId: state.playthroughId,
    expectedRevision: opened.state.revision,
  });
  if (!advanced.accepted) return state;
  const finished = transitionNarrative(compiled, advanced.state, {
    type: 'finish',
    playthroughId: state.playthroughId,
    expectedRevision: advanced.state.revision,
  });
  return finished.accepted ? finished.state : state;
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
      if (command.type === 'RESTORE_GAME') {
        if (!gardenGraphs[command.mapId]?.anchors.some((anchor) => anchor.id === command.anchorId))
          return state;
        const decoded = decodeNarrativeState(compiledNarrative, command.narrative);
        if (!decoded.ok) return state;
        return {
          ...state,
          phase: 'playing',
          mapId: command.mapId,
          anchorId: command.anchorId,
          lastAnchorId: null,
          walk: null,
          lastInteractionTarget: null,
          narrative: decoded.state,
        };
      }
      if (state.phase !== 'playing') return state;

      if (command.type === 'DIALOGUE_EXIT') {
        const narrative = applyNarrativeIntent(compiledNarrative, state.narrative, {
          type: 'exit-dialogue',
        });
        return narrative === state.narrative ? state : { ...state, narrative };
      }

      if (command.type === 'DIALOGUE_CHOICE') {
        const chosen = applyNarrativeIntent(compiledNarrative, state.narrative, {
          type: 'choose',
          choiceId: command.choiceId,
        });
        if (chosen === state.narrative) return state;
        const narrative =
          command.choiceId === 'help-gardener' || command.choiceId === 'follow-light'
            ? applyNarrativeIntent(compiledNarrative, chosen, { type: 'exit-dialogue' })
            : chosen;
        return { ...state, narrative };
      }

      if (state.narrative.activeDialogue && command.type !== 'ARRIVE') return state;

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
        if (transition && nextMapId)
          return {
            ...state,
            mapId: nextMapId,
            anchorId: transition.toAnchor,
            lastAnchorId: null,
            walk: null,
            lastInteractionTarget: null,
          };

        if (target.id === 'gardener' || target.id === 'traveler') {
          if (state.mapId !== 'village' || state.narrative.endingId) return state;
          const narrative = applyNarrativeIntent(compiledNarrative, state.narrative, {
            type: 'open-dialogue',
            dialogueId: 'village-story',
          });
          return narrative === state.narrative ? state : { ...state, narrative };
        }

        const triggerByTarget: Partial<Record<GardenTargetId, string>> = {
          'seed-basket': 'find-garden-seed',
          'planting-bed': 'plant-garden-seed',
          'clue-stone': 'find-lantern-clue',
          'ancient-lantern': 'light-ancient-lantern',
        };
        const triggerId = triggerByTarget[target.id];
        if (triggerId) {
          const triggered = applyNarrativeIntent(compiledNarrative, state.narrative, {
            type: 'trigger',
            triggerId,
          });
          if (triggered === state.narrative) return state;
          return {
            ...state,
            narrative: finishAvailableEnding(compiledNarrative, triggered),
            lastInteractionTarget: target.id,
          };
        }

        return { ...state, lastInteractionTarget: target.id };
      }

      return state;
    },
  });

  return Object.assign(runtime, { compiledNarrative });
}
