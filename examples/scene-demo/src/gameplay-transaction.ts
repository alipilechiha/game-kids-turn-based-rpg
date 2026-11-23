import {
  transitionGameplay,
  type CompiledGameplay,
  type GameplayCommand,
  type GameplayPlayerIntent,
  type GameplayState,
} from 'waypoint-rpg-gameplay';
import {
  transitionNarrative,
  type CompiledNarrative,
  type NarrativeState,
} from 'waypoint-rpg-narrative';
import { CONSEQUENCE_TO_TRIGGER, type TrialConsequenceId } from './content/blood-leaf-gameplay.js';

export interface CombatTransactionInput {
  readonly gameplayCompiled: CompiledGameplay;
  readonly narrativeCompiled: CompiledNarrative;
  readonly gameplay: GameplayState;
  readonly narrative: NarrativeState;
  readonly intent: GameplayPlayerIntent;
  readonly playthroughId: string;
  readonly expectedGameplayRevision: number;
  readonly encounterInstanceId?: string;
  /** Test hook: force narrative trigger rejection after a successful combat terminal. */
  readonly injectNarrativeFailure?: boolean;
}

export type CombatTransactionResult =
  | {
      readonly accepted: true;
      readonly gameplay: GameplayState;
      readonly narrative: NarrativeState;
      readonly change: string;
    }
  | {
      readonly accepted: false;
      readonly gameplay: GameplayState;
      readonly narrative: NarrativeState;
      readonly reason: string;
    };

export function executeCombatTransaction(input: CombatTransactionInput): CombatTransactionResult {
  const originalGameplay = input.gameplay;
  const originalNarrative = input.narrative;

  const command: GameplayCommand = {
    ...input.intent,
    playthroughId: input.playthroughId,
    expectedRevision: input.expectedGameplayRevision,
    ...(input.encounterInstanceId !== undefined
      ? { encounterInstanceId: input.encounterInstanceId }
      : {}),
  };

  const combat = transitionGameplay(input.gameplayCompiled, originalGameplay, command);
  if (!combat.accepted) {
    return {
      accepted: false,
      gameplay: originalGameplay,
      narrative: originalNarrative,
      reason: combat.reason.code,
    };
  }

  const terminal = combat.state.encounter?.outcome ?? null;
  if (terminal === null) {
    return {
      accepted: true,
      gameplay: combat.state,
      narrative: originalNarrative,
      change: combat.change,
    };
  }

  const marker = combat.state.outcomeMarkers.find(
    (item) => item.encounterInstanceId === combat.state.encounter?.instanceId,
  );
  if (!marker) {
    return {
      accepted: false,
      gameplay: originalGameplay,
      narrative: originalNarrative,
      reason: 'missing-outcome-marker',
    };
  }

  const consequenceId = marker.consequenceId as TrialConsequenceId;
  const triggerId = CONSEQUENCE_TO_TRIGGER[consequenceId];
  if (!triggerId) {
    return {
      accepted: false,
      gameplay: originalGameplay,
      narrative: originalNarrative,
      reason: 'unmapped-consequence',
    };
  }

  if (input.injectNarrativeFailure) {
    return {
      accepted: false,
      gameplay: originalGameplay,
      narrative: originalNarrative,
      reason: 'injected-narrative-failure',
    };
  }

  const narrativeResult = transitionNarrative(input.narrativeCompiled, originalNarrative, {
    type: 'trigger',
    triggerId,
    playthroughId: originalNarrative.playthroughId,
    expectedRevision: originalNarrative.revision,
  });

  if (!narrativeResult.accepted) {
    return {
      accepted: false,
      gameplay: originalGameplay,
      narrative: originalNarrative,
      reason: narrativeResult.reason.code,
    };
  }

  return {
    accepted: true,
    gameplay: combat.state,
    narrative: narrativeResult.state,
    change: combat.change,
  };
}
