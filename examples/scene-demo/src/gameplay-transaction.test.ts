import { createGameplayState, transitionGameplay, type GameplayState } from 'waypoint-rpg-gameplay';
import { createNarrativeState, transitionNarrative } from 'waypoint-rpg-narrative';
import { describe, expect, it } from 'vitest';
import { bloodLeafGameplay, GUARDIAN_TRIAL_ENCOUNTER_ID } from './content/blood-leaf-gameplay.js';
import { bloodLeafNarrative } from './content/blood-leaf.js';
import { executeCombatTransaction } from './gameplay-transaction.js';

function vengeanceCourtyardNarrative(playthroughId = 'combat-transaction-test') {
  let narrative = createNarrativeState(bloodLeafNarrative, playthroughId);
  const steps = [
    { type: 'open-dialogue' as const, dialogueId: 'guardian-dialogue' },
    { type: 'choose' as const, choiceId: 'seek-vengeance' },
    { type: 'advance' as const },
    { type: 'exit-dialogue' as const },
  ];
  for (const step of steps) {
    const result = transitionNarrative(bloodLeafNarrative, narrative, {
      ...step,
      playthroughId: narrative.playthroughId,
      expectedRevision: narrative.revision,
    });
    expect(result.accepted).toBe(true);
    if (result.accepted) narrative = result.state;
  }
  return narrative;
}

function startEncounter(gameplay: GameplayState, instanceId = 'trial-instance-one'): GameplayState {
  const begun = transitionGameplay(bloodLeafGameplay, gameplay, {
    type: 'start-encounter',
    playthroughId: gameplay.playthroughId,
    expectedRevision: gameplay.revision,
    encounterId: GUARDIAN_TRIAL_ENCOUNTER_ID,
    instanceId,
  });
  expect(begun.accepted).toBe(true);
  if (!begun.accepted) throw new Error('failed to start encounter');
  return begun.state;
}

describe('executeCombatTransaction', () => {
  it('wins the guardian trial with lethal mark and commits the narrative trigger', () => {
    const playthroughId = 'trial-victory';
    const narrative = vengeanceCourtyardNarrative(playthroughId);
    const gameplay = startEncounter(createGameplayState(bloodLeafGameplay, playthroughId));
    const playerId = gameplay.encounter?.combatants.find((item) => item.team === 'player')?.id;
    const enemyId = gameplay.encounter?.combatants.find((item) => item.team === 'enemy')?.id;
    expect(playerId).toBeDefined();
    expect(enemyId).toBeDefined();
    if (!playerId || !enemyId) return;

    const victory = executeCombatTransaction({
      gameplayCompiled: bloodLeafGameplay,
      narrativeCompiled: bloodLeafNarrative,
      gameplay,
      narrative,
      playthroughId,
      expectedGameplayRevision: gameplay.revision,
      encounterInstanceId: gameplay.encounter?.instanceId,
      intent: {
        type: 'use-ability',
        participantId: playerId,
        abilityId: 'lethal-mark',
        targetParticipantId: enemyId,
      },
    });

    expect(victory.accepted).toBe(true);
    if (!victory.accepted) return;
    expect(victory.gameplay.encounter?.outcome).toBe('victory');
    expect(victory.narrative.facts['guardian-trial-complete']).toBe(true);
    expect(victory.narrative.facts['guardian-trial-won']).toBe(true);
    expect(victory.narrative.appliedTriggerIds).toContain('guardian-trial-won');
  });

  it('rolls back when narrative trigger application fails after terminal combat', () => {
    const playthroughId = 'trial-injected-failure';
    const narrative = vengeanceCourtyardNarrative(playthroughId);
    const gameplay = startEncounter(createGameplayState(bloodLeafGameplay, playthroughId));
    const playerId = gameplay.encounter?.combatants.find((item) => item.team === 'player')?.id;
    const enemyId = gameplay.encounter?.combatants.find((item) => item.team === 'enemy')?.id;
    expect(playerId).toBeDefined();
    expect(enemyId).toBeDefined();
    if (!playerId || !enemyId) return;

    const result = executeCombatTransaction({
      gameplayCompiled: bloodLeafGameplay,
      narrativeCompiled: bloodLeafNarrative,
      gameplay,
      narrative,
      playthroughId,
      expectedGameplayRevision: gameplay.revision,
      encounterInstanceId: gameplay.encounter?.instanceId,
      injectNarrativeFailure: true,
      intent: {
        type: 'use-ability',
        participantId: playerId,
        abilityId: 'lethal-mark',
        targetParticipantId: enemyId,
      },
    });

    expect(result.accepted).toBe(false);
    if (result.accepted) return;
    expect(result.reason).toBe('injected-narrative-failure');
    expect(result.gameplay).toBe(gameplay);
    expect(result.narrative).toBe(narrative);
  });
});
