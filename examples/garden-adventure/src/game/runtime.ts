import { createGameRuntime, findPath, type AnchorId, type GameRuntime } from 'waypoint-rpg-core';
import {
  applyGameplayGrant,
  compileGameplay,
  createGameplayState,
  decodeGameplayState,
  getCharacterLevel,
  getCharacterAttributes,
  getUnlockedAbilityIds,
  transitionGameplay,
  type GameplayPlayerIntent,
  type GameplayState,
  type GameplayCommand,
} from 'waypoint-rpg-gameplay';
import {
  compileNarrative,
  createNarrativeState,
  decodeNarrativeState,
  getFact,
  getQuestStatus,
  transitionNarrative,
  type NarrativeDefinition,
  type NarrativeCommand,
  type NarrativeState,
  validateNarrative,
} from 'waypoint-rpg-narrative';
import { gardenGameplayDefinition } from '../content/gameplay.js';
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
  readonly gameplay: GameplayState;
}

export type GardenCommand =
  | { readonly type: 'NEW_GAME' }
  | {
      readonly type: 'RESTORE_GAME';
      readonly mapId: GardenMapId;
      readonly anchorId: AnchorId;
      readonly narrative: unknown;
      readonly gameplay: unknown;
    }
  | { readonly type: 'MOVE_TO'; readonly targetId: GardenTargetId }
  | { readonly type: 'ARRIVE'; readonly routeId: string; readonly anchorId: AnchorId }
  | { readonly type: 'INTERACT'; readonly targetId: GardenTargetId }
  | { readonly type: 'DIALOGUE_CHOICE'; readonly choiceId: string }
  | { readonly type: 'DIALOGUE_EXIT' }
  | {
      readonly type: 'BATTLE_ACTION';
      readonly playthroughId: string;
      readonly expectedRevision: number;
      readonly encounterInstanceId: string;
      readonly intent: Extract<
        GameplayPlayerIntent,
        { type: 'move' | 'use-ability' | 'wait' | 'withdraw' }
      >;
    }
  | { readonly type: 'TOGGLE_CHARM' };

export interface GardenRuntime extends GameRuntime<GardenState, GardenCommand> {
  readonly compiledNarrative: ReturnType<typeof compileNarrative>;
  readonly compiledGameplay: ReturnType<typeof compileGameplay>;
}

export interface GardenRuntimeOptions {
  readonly createPlaythroughId?: () => string;
  readonly definition?: NarrativeDefinition;
}

function compileNarrativeDefinition(definition: NarrativeDefinition) {
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

function compileGameplayDefinition() {
  return compileGameplay(gardenGameplayDefinition);
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
): NarrativeState | null {
  const result = transitionNarrative(compiled, state, {
    ...intent,
    playthroughId: state.playthroughId,
    expectedRevision: state.revision,
  } as NarrativeCommand);
  return result.accepted ? result.state : null;
}

function finishAvailableEnding(
  compiled: ReturnType<typeof compileNarrative>,
  state: NarrativeState,
): NarrativeState | null {
  const path = getFact(state, 'story-path');
  const expectedNode = path === 'gardener' ? 'gardener-wait' : 'traveler-wait';
  if (
    state.endingId ||
    state.activeDialogue ||
    state.suspendedDialogue?.dialogueId !== 'village-story' ||
    state.suspendedDialogue.nodeId !== expectedNode
  ) {
    return null;
  }

  const opened = transitionNarrative(compiled, state, {
    type: 'open-dialogue',
    dialogueId: 'village-story',
    playthroughId: state.playthroughId,
    expectedRevision: state.revision,
  });
  if (!opened.accepted) return null;
  const advanced = transitionNarrative(compiled, opened.state, {
    ...(path === 'lantern'
      ? { type: 'choose' as const, choiceId: 'hear-guardian-ending' }
      : { type: 'advance' as const }),
    playthroughId: state.playthroughId,
    expectedRevision: opened.state.revision,
  });
  if (!advanced.accepted) return null;
  const finished = transitionNarrative(compiled, advanced.state, {
    type: 'finish',
    playthroughId: state.playthroughId,
    expectedRevision: advanced.state.revision,
  });
  return finished.accepted ? finished.state : null;
}

function createStartingGrant(
  compiledGameplay: ReturnType<typeof compileGameplay>,
  gameplay: GameplayState,
  rewardId: string,
  bundle: {
    readonly experience?: readonly { readonly characterId: string; readonly amount: number }[];
    readonly items?: readonly { readonly itemId: string; readonly quantity: number }[];
    readonly equipment?: readonly {
      readonly characterId: string;
      readonly itemId: string;
      readonly slotId: string;
    }[];
  },
): GameplayState | null {
  const result = applyGameplayGrant(compiledGameplay, gameplay, {
    playthroughId: gameplay.playthroughId,
    expectedRevision: gameplay.revision,
    rewardId,
    ...bundle,
  });
  return result.accepted ? result.state : null;
}

const consequenceTriggers: Readonly<Record<string, string>> = {
  'guardian-victory': 'guardian-victory',
  'guardian-retry': 'guardian-retry',
};

export function createGardenRuntime(options: GardenRuntimeOptions = {}): GardenRuntime {
  const compiledNarrative = compileNarrativeDefinition(
    options.definition ?? gardenNarrativeDefinition,
  );
  const compiledGameplay = compileGameplayDefinition();
  let generatedPlaythrough = 0;
  let generatedRoute = 0;
  const createPlaythroughId =
    options.createPlaythroughId ?? (() => `garden-${Date.now()}-${++generatedPlaythrough}`);

  const createNewGame = (): GardenState => {
    const playthroughId = createPlaythroughId();
    return {
      phase: 'playing',
      mapId: 'village',
      anchorId: gardenMaps.village.spawnAnchorId,
      lastAnchorId: null,
      walk: null,
      lastInteractionTarget: null,
      narrative: createNarrativeState(compiledNarrative, playthroughId),
      gameplay: createGameplayState(compiledGameplay, playthroughId),
    };
  };

  const runtime = createGameRuntime<GardenState, GardenCommand>({
    createInitialState: () => ({ ...createNewGame(), phase: 'title' }),
    reducer(state, command) {
      if (command.type === 'NEW_GAME') return createNewGame();
      if (command.type === 'RESTORE_GAME') {
        if (!gardenGraphs[command.mapId]?.anchors.some((anchor) => anchor.id === command.anchorId))
          return state;
        const narrative = decodeNarrativeState(compiledNarrative, command.narrative);
        const gameplay = decodeGameplayState(compiledGameplay, command.gameplay);
        if (
          !narrative.ok ||
          !gameplay.ok ||
          narrative.state.playthroughId !== gameplay.state.playthroughId
        )
          return state;
        return {
          ...state,
          phase: 'playing',
          mapId: command.mapId,
          anchorId: command.anchorId,
          lastAnchorId: null,
          walk: null,
          lastInteractionTarget: null,
          narrative: narrative.state,
          gameplay: gameplay.state,
        };
      }
      if (state.phase !== 'playing') return state;

      if (command.type === 'BATTLE_ACTION')
        return applyBattleAction(compiledNarrative, compiledGameplay, state, command);
      if (state.gameplay.encounter?.outcome === null) return state;

      if (command.type === 'TOGGLE_CHARM') {
        const equipped = state.gameplay.equipment['garden-hero']?.charm === 'lantern-charm';
        const intent: GameplayCommand = equipped
          ? {
              type: 'unequip-item',
              characterId: 'garden-hero',
              slotId: 'charm',
              playthroughId: state.gameplay.playthroughId,
              expectedRevision: state.gameplay.revision,
            }
          : {
              type: 'equip-item',
              characterId: 'garden-hero',
              slotId: 'charm',
              itemId: 'lantern-charm',
              playthroughId: state.gameplay.playthroughId,
              expectedRevision: state.gameplay.revision,
            };
        const result = transitionGameplay(compiledGameplay, state.gameplay, intent);
        return result.accepted ? { ...state, gameplay: result.state } : state;
      }

      if (command.type === 'DIALOGUE_EXIT') {
        const narrative = applyNarrativeIntent(compiledNarrative, state.narrative, {
          type: 'exit-dialogue',
        });
        return narrative ? { ...state, narrative } : state;
      }

      if (command.type === 'DIALOGUE_CHOICE') {
        const chosen = applyNarrativeIntent(compiledNarrative, state.narrative, {
          type: 'choose',
          choiceId: command.choiceId,
        });
        if (!chosen) return state;

        if (command.choiceId === 'challenge-guardian') {
          const guardian = getGardenTarget('guardian');
          if (
            state.mapId !== 'garden' ||
            !guardian ||
            state.anchorId !== guardian.anchorId ||
            state.lastInteractionTarget !== 'guardian' ||
            getFact(state.narrative, 'story-path') !== 'lantern' ||
            getFact(state.narrative, 'clue-found') !== true ||
            getQuestStatus(compiledNarrative, state.narrative, 'lantern-quest') !== 'active'
          )
            return state;
          const exited = applyNarrativeIntent(compiledNarrative, chosen, {
            type: 'exit-dialogue',
          });
          if (!exited) return state;
          const instanceId = `guardian-trial-${state.gameplay.revision + 1}`;
          const started = transitionGameplay(compiledGameplay, state.gameplay, {
            type: 'start-encounter',
            encounterId: 'guardian-trial',
            instanceId,
            playthroughId: state.gameplay.playthroughId,
            expectedRevision: state.gameplay.revision,
          });
          if (!started.accepted) return state;
          return { ...state, narrative: exited, gameplay: started.state };
        }

        const narrative =
          command.choiceId === 'help-gardener' || command.choiceId === 'follow-light'
            ? applyNarrativeIntent(compiledNarrative, chosen, { type: 'exit-dialogue' })
            : chosen;
        return narrative ? { ...state, narrative } : state;
      }

      if (state.narrative.activeDialogue) return state;

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
          return narrative ? { ...state, narrative, lastInteractionTarget: target.id } : state;
        }

        if (target.id === 'guardian') {
          if (
            state.mapId !== 'garden' ||
            state.narrative.endingId ||
            getFact(state.narrative, 'story-path') !== 'lantern' ||
            getFact(state.narrative, 'clue-found') !== true ||
            getQuestStatus(compiledNarrative, state.narrative, 'lantern-quest') !== 'active'
          )
            return state;
          const opened = applyNarrativeIntent(compiledNarrative, state.narrative, {
            type: 'open-dialogue',
            dialogueId: 'village-story',
          });
          if (!opened) return state;
          const narrative = applyNarrativeIntent(compiledNarrative, opened, {
            type: 'choose',
            choiceId: 'visit-guardian',
          });
          return narrative ? { ...state, narrative, lastInteractionTarget: 'guardian' } : state;
        }

        const triggerByTarget: Partial<Record<GardenTargetId, string>> = {
          'seed-basket': 'find-garden-seed',
          'planting-bed': 'plant-garden-seed',
          'clue-stone': 'find-lantern-clue',
        };
        const triggerId = triggerByTarget[target.id];
        if (triggerId === 'find-garden-seed') {
          if (
            getFact(state.narrative, 'story-path') !== 'gardener' ||
            getQuestStatus(compiledNarrative, state.narrative, 'gardener-quest') !== 'active'
          )
            return state;
          const narrative = applyNarrativeIntent(compiledNarrative, state.narrative, {
            type: 'trigger',
            triggerId,
          });
          if (!narrative) return state;
          const gameplay = createStartingGrant(compiledGameplay, state.gameplay, 'garden-seed', {
            items: [{ itemId: 'special-seed', quantity: 1 }],
          });
          return gameplay
            ? { ...state, narrative, gameplay, lastInteractionTarget: target.id }
            : state;
        }

        if (triggerId === 'plant-garden-seed') {
          if (
            getFact(state.narrative, 'story-path') !== 'gardener' ||
            getFact(state.narrative, 'seed-found') !== true ||
            getQuestStatus(compiledNarrative, state.narrative, 'gardener-quest') !== 'active'
          )
            return state;
          const narrativeResult = transitionNarrative(compiledNarrative, state.narrative, {
            type: 'trigger',
            triggerId,
            playthroughId: state.narrative.playthroughId,
            expectedRevision: state.narrative.revision,
          });
          if (!narrativeResult.accepted) return state;
          const consumed = transitionGameplay(compiledGameplay, state.gameplay, {
            type: 'consume-item',
            itemId: 'special-seed',
            quantity: 1,
            playthroughId: state.gameplay.playthroughId,
            expectedRevision: state.gameplay.revision,
          });
          if (!consumed.accepted) return state;
          const rewarded = createStartingGrant(
            compiledGameplay,
            consumed.state,
            'garden-restoration',
            {
              experience: [{ characterId: 'garden-hero', amount: 24 }],
              items: [
                { itemId: 'garden-reward', quantity: 1 },
                { itemId: 'lantern-charm', quantity: 1 },
              ],
              equipment: [{ characterId: 'garden-hero', itemId: 'lantern-charm', slotId: 'charm' }],
            },
          );
          if (!rewarded) return state;
          const narrative = finishAvailableEnding(compiledNarrative, narrativeResult.state);
          if (!narrative) return state;
          return {
            ...state,
            narrative,
            gameplay: rewarded,
            lastInteractionTarget: target.id,
          };
        }

        if (triggerId === 'find-lantern-clue') {
          if (
            getFact(state.narrative, 'story-path') !== 'lantern' ||
            getQuestStatus(compiledNarrative, state.narrative, 'lantern-quest') !== 'active'
          )
            return state;
          const narrative = applyNarrativeIntent(compiledNarrative, state.narrative, {
            type: 'trigger',
            triggerId,
          });
          return narrative ? { ...state, narrative, lastInteractionTarget: target.id } : state;
        }

        return { ...state, lastInteractionTarget: target.id };
      }

      return state;
    },
  });

  return Object.assign(runtime, { compiledNarrative, compiledGameplay });
}

function applyBattleAction(
  compiledNarrative: ReturnType<typeof compileNarrative>,
  compiledGameplay: ReturnType<typeof compileGameplay>,
  state: GardenState,
  command: Extract<GardenCommand, { type: 'BATTLE_ACTION' }>,
): GardenState {
  const encounter = state.gameplay.encounter;
  if (
    state.mapId !== 'garden' ||
    command.playthroughId !== state.gameplay.playthroughId ||
    command.playthroughId !== state.narrative.playthroughId ||
    command.expectedRevision !== state.gameplay.revision ||
    !encounter ||
    encounter.outcome !== null ||
    encounter.instanceId !== command.encounterInstanceId ||
    encounter.definitionId !== 'guardian-trial'
  )
    return state;

  const intent = command.intent;
  const gameplayCommand: GameplayCommand = {
    ...intent,
    playthroughId: state.gameplay.playthroughId,
    expectedRevision: state.gameplay.revision,
    encounterInstanceId: encounter.instanceId,
  };
  const result = transitionGameplay(compiledGameplay, state.gameplay, gameplayCommand);
  if (!result.accepted) return state;

  if (result.state.encounter?.outcome === null || result.state.encounter === null)
    return { ...state, gameplay: result.state };

  const marker = result.state.outcomeMarkers.find(
    (candidate) => candidate.encounterInstanceId === encounter.instanceId,
  );
  const priorMarker = state.gameplay.outcomeMarkers.some(
    (candidate) => candidate.encounterInstanceId === encounter.instanceId,
  );
  const encounterDefinition = compiledGameplay.definition.encounters.find(
    (candidate) => candidate.id === 'guardian-trial',
  );
  if (!marker || priorMarker || !encounterDefinition) return state;
  const authoredMapping = encounterDefinition.outcomeMappings.find(
    (candidate) => candidate.outcome === marker.outcome,
  );
  if (authoredMapping?.consequenceId !== marker.consequenceId) return state;
  const triggerId = consequenceTriggers[marker.consequenceId];
  if (!triggerId) return state;

  const narrativeResult = transitionNarrative(compiledNarrative, state.narrative, {
    type: 'trigger',
    triggerId,
    playthroughId: state.narrative.playthroughId,
    expectedRevision: state.narrative.revision,
  });
  if (!narrativeResult.accepted) return state;

  let narrative = narrativeResult.state;
  if (marker.outcome === 'victory') {
    const finished = finishAvailableEnding(compiledNarrative, narrative);
    if (!finished) return state;
    narrative = finished;
  }
  return { ...state, narrative, gameplay: result.state };
}

export function getGardenProgress(runtime: GardenRuntime, state: GardenState) {
  return {
    level: getCharacterLevel(runtime.compiledGameplay, state.gameplay, 'garden-hero'),
    abilities: getUnlockedAbilityIds(runtime.compiledGameplay, state.gameplay, 'garden-hero'),
    attributes: getCharacterAttributes(runtime.compiledGameplay, state.gameplay, 'garden-hero'),
  };
}
