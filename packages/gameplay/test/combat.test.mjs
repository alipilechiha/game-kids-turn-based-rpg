import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compileGameplay,
  createGameplayState,
  getEffectiveCharacterAttributes,
  transitionGameplay,
} from '../dist/index.js';

function content(options = {}) {
  const enemyPosition = options.enemyPosition ?? { x: 4, y: 4 };
  const enemyHealth = options.enemyHealth ?? 10;
  const blockedCells = options.blockedCells ?? [];
  const heroFocus = options.heroFocus ?? 4;
  return compileGameplay({
    schemaVersion: 1,
    id: 'combat-demo',
    contentVersion: 'copy-1',
    compatibilityVersion: 'shape-1',
    movementAttributeId: 'movement',
    healthResourceId: 'health',
    progression: { maxLevel: 1, experienceThresholds: [] },
    attributes: [
      { id: 'movement', minimum: 1, maximum: 8, defaultValue: 2 },
      { id: 'power', minimum: 0, maximum: 10, defaultValue: 1 },
    ],
    resources: [
      { id: 'health', maximum: 10, defaultValue: 10 },
      { id: 'focus', maximum: 4, defaultValue: 4 },
    ],
    characters: [
      {
        id: 'hero',
        baseAttributes: { movement: 3, power: 2 },
        startingResources: { health: 10, focus: heroFocus },
        startingAbilityIds: ['strike', 'self-guard', 'mark-refresh', 'mark-ignore', 'lethal-mark'],
      },
      {
        id: 'guardian',
        baseAttributes: { movement: 2, power: 2 },
        startingResources: { health: enemyHealth, focus: 4 },
      },
    ],
    items: [],
    equipmentSlots: [],
    abilities: [
      {
        id: 'strike',
        resourceCosts: { focus: 2 },
        target: { kind: 'enemy', minimumRange: 1, maximumRange: 1 },
        effects: [{ op: 'damage', amount: 4 }],
        cooldownTurns: 1,
      },
      {
        id: 'self-guard',
        resourceCosts: {},
        target: { kind: 'self', minimumRange: 0, maximumRange: 0 },
        effects: [{ op: 'apply-status', statusEffectId: 'guarded' }],
      },
      {
        id: 'mark-refresh',
        resourceCosts: {},
        target: { kind: 'enemy', minimumRange: 1, maximumRange: 1 },
        effects: [{ op: 'apply-status', statusEffectId: 'tag-refresh' }],
      },
      {
        id: 'mark-ignore',
        resourceCosts: {},
        target: { kind: 'enemy', minimumRange: 1, maximumRange: 1 },
        effects: [{ op: 'apply-status', statusEffectId: 'tag-ignore' }],
      },
      {
        id: 'lethal-mark',
        resourceCosts: {},
        target: { kind: 'enemy', minimumRange: 1, maximumRange: 1 },
        effects: [
          { op: 'damage', amount: 10 },
          { op: 'apply-status', statusEffectId: 'tag-refresh' },
        ],
      },
    ],
    statusEffects: [
      {
        id: 'guarded',
        durationTurns: 2,
        stackingPolicy: 'refresh',
        modifiers: [{ attributeId: 'power', amount: 3 }],
      },
      { id: 'tag-refresh', durationTurns: 2, stackingPolicy: 'refresh' },
      { id: 'tag-ignore', durationTurns: 2, stackingPolicy: 'ignore' },
    ],
    boards: [{ id: 'arena', width: 5, height: 5, blockedCells }],
    encounters: [
      {
        id: 'guardian-trial',
        boardId: 'arena',
        maxTurns: 10,
        allowWithdrawal: true,
        participants: [
          {
            id: 'hero-seat',
            characterId: 'hero',
            team: 'player',
            position: { x: 0, y: 0 },
            initiative: 10,
          },
          {
            id: 'guardian-seat',
            characterId: 'guardian',
            team: 'enemy',
            position: enemyPosition,
            initiative: 1,
          },
        ],
        victoryRewards: { experience: [{ characterId: 'hero', amount: 5 }] },
        outcomeMappings: [
          { outcome: 'victory', consequenceId: 'won' },
          { outcome: 'defeat', consequenceId: 'lost' },
          { outcome: 'turn-limit', consequenceId: 'timed-out' },
          { outcome: 'withdrawn', consequenceId: 'withdrew' },
        ],
      },
    ],
  });
}

function start(compiled, instanceId = 'trial-instance') {
  const fresh = createGameplayState(compiled, 'playthrough-one');
  return transitionGameplay(compiled, fresh, {
    type: 'start-encounter',
    playthroughId: 'playthrough-one',
    expectedRevision: 0,
    encounterId: 'guardian-trial',
    instanceId,
  });
}

function playerCommand(compiled, state, intent) {
  return transitionGameplay(compiled, state, {
    ...intent,
    playthroughId: state.playthroughId,
    encounterInstanceId: state.encounter.instanceId,
    expectedRevision: state.revision,
  });
}

function combatant(state, id) {
  return state.encounter.combatants.find((item) => item.id === id);
}

test('starts a distinct encounter instance and moves exactly within the effective four-way budget', () => {
  const compiled = content();
  const begun = start(compiled);
  assert.equal(begun.accepted, true);
  if (!begun.accepted) return;
  assert.equal(begun.state.revision, 1);
  assert.equal(begun.state.encounter.instanceId, 'trial-instance');
  assert.equal(begun.state.encounter.definitionId, 'guardian-trial');

  const moved = playerCommand(compiled, begun.state, {
    type: 'move',
    participantId: 'hero-seat',
    destination: { x: 0, y: 3 },
  });
  assert.equal(moved.accepted, true);
  if (!moved.accepted) return;
  assert.deepEqual(combatant(moved.state, 'hero-seat').position, { x: 0, y: 3 });
  assert.equal(moved.state.revision, 3); // one player action and one internal enemy wait
  assert.equal(moved.state.encounter.activeParticipantId, 'hero-seat');
});

test('rejects over-budget, blocked, occupied, stale-instance, and enemy-authored movement unchanged', () => {
  const overCompiled = content();
  const overStarted = start(overCompiled);
  assert.equal(overStarted.accepted, true);
  if (!overStarted.accepted) return;
  const over = playerCommand(overCompiled, overStarted.state, {
    type: 'move',
    participantId: 'hero-seat',
    destination: { x: 0, y: 4 },
  });
  assert.equal(over.accepted, false);
  assert.equal(over.state, overStarted.state);
  if (!over.accepted) assert.equal(over.reason.code, 'illegal-move');

  const wall = Array.from({ length: 5 }, (_, y) => ({ x: 1, y }));
  const blockedCompiled = content({ blockedCells: wall });
  const blockedStarted = start(blockedCompiled);
  assert.equal(blockedStarted.accepted, true);
  if (!blockedStarted.accepted) return;
  const blocked = playerCommand(blockedCompiled, blockedStarted.state, {
    type: 'move',
    participantId: 'hero-seat',
    destination: { x: 2, y: 0 },
  });
  assert.equal(blocked.accepted, false);
  assert.equal(blocked.state, blockedStarted.state);

  const occupiedCompiled = content({ enemyPosition: { x: 0, y: 2 } });
  const occupiedStarted = start(occupiedCompiled);
  assert.equal(occupiedStarted.accepted, true);
  if (!occupiedStarted.accepted) return;
  const occupied = playerCommand(occupiedCompiled, occupiedStarted.state, {
    type: 'move',
    participantId: 'hero-seat',
    destination: { x: 0, y: 2 },
  });
  assert.equal(occupied.accepted, false);
  assert.equal(occupied.state, occupiedStarted.state);

  const wrongInstance = transitionGameplay(occupiedCompiled, occupiedStarted.state, {
    type: 'move',
    participantId: 'hero-seat',
    destination: { x: 0, y: 1 },
    playthroughId: occupiedStarted.state.playthroughId,
    encounterInstanceId: 'old-instance',
    expectedRevision: occupiedStarted.state.revision,
  });
  assert.equal(wrongInstance.accepted, false);
  assert.equal(wrongInstance.state, occupiedStarted.state);

  const forgedEnemy = playerCommand(occupiedCompiled, occupiedStarted.state, {
    type: 'move',
    participantId: 'guardian-seat',
    destination: { x: 1, y: 2 },
  });
  assert.equal(forgedEnemy.accepted, false);
  assert.equal(forgedEnemy.state, occupiedStarted.state);
});

test('rejects a delayed player intent captured before another command committed', () => {
  const compiled = content();
  const begun = start(compiled);
  assert.equal(begun.accepted, true);
  if (!begun.accepted) return;
  const captured = {
    type: 'wait',
    participantId: 'hero-seat',
    playthroughId: begun.state.playthroughId,
    encounterInstanceId: begun.state.encounter.instanceId,
    expectedRevision: begun.state.revision,
  };

  const committed = transitionGameplay(compiled, begun.state, captured);
  assert.equal(committed.accepted, true);
  if (!committed.accepted) return;
  const delayed = transitionGameplay(compiled, committed.state, captured);
  assert.equal(delayed.accepted, false);
  assert.equal(delayed.state, committed.state);
  if (!delayed.accepted) assert.equal(delayed.reason.code, 'stale-revision');
});

test('validates ability ownership, target team/range, resource costs, and cooldowns', () => {
  const compiled = content({ enemyPosition: { x: 1, y: 0 } });
  const begun = start(compiled);
  assert.equal(begun.accepted, true);
  if (!begun.accepted) return;

  const attack = playerCommand(compiled, begun.state, {
    type: 'use-ability',
    participantId: 'hero-seat',
    abilityId: 'strike',
    targetParticipantId: 'guardian-seat',
  });
  assert.equal(attack.accepted, true);
  if (!attack.accepted) return;
  assert.equal(combatant(attack.state, 'hero-seat').resources.focus, 2);
  assert.equal(combatant(attack.state, 'guardian-seat').resources.health, 6);
  assert.equal(combatant(attack.state, 'hero-seat').cooldowns.strike, 1);

  const cooling = playerCommand(compiled, attack.state, {
    type: 'use-ability',
    participantId: 'hero-seat',
    abilityId: 'strike',
    targetParticipantId: 'guardian-seat',
  });
  assert.equal(cooling.accepted, false);
  assert.equal(cooling.state, attack.state);
  if (!cooling.accepted) assert.equal(cooling.reason.code, 'ability-unavailable');

  const waited = playerCommand(compiled, attack.state, {
    type: 'wait',
    participantId: 'hero-seat',
  });
  assert.equal(waited.accepted, true);
  if (!waited.accepted) return;
  assert.equal(combatant(waited.state, 'hero-seat').cooldowns.strike ?? 0, 0);

  const again = playerCommand(compiled, waited.state, {
    type: 'use-ability',
    participantId: 'hero-seat',
    abilityId: 'strike',
    targetParticipantId: 'guardian-seat',
  });
  assert.equal(again.accepted, true);

  const farCompiled = content();
  const farStarted = start(farCompiled);
  assert.equal(farStarted.accepted, true);
  if (!farStarted.accepted) return;
  const outOfRange = playerCommand(farCompiled, farStarted.state, {
    type: 'use-ability',
    participantId: 'hero-seat',
    abilityId: 'strike',
    targetParticipantId: 'guardian-seat',
  });
  assert.equal(outOfRange.accepted, false);
  assert.equal(outOfRange.state, farStarted.state);

  const poorCompiled = content({ enemyPosition: { x: 1, y: 0 }, heroFocus: 1 });
  const poorStarted = start(poorCompiled);
  assert.equal(poorStarted.accepted, true);
  if (!poorStarted.accepted) return;
  const insufficient = playerCommand(poorCompiled, poorStarted.state, {
    type: 'use-ability',
    participantId: 'hero-seat',
    abilityId: 'strike',
    targetParticipantId: 'guardian-seat',
  });
  assert.equal(insufficient.accepted, false);
  assert.equal(insufficient.state, poorStarted.state);
  if (!insufficient.accepted) assert.equal(insufficient.reason.code, 'insufficient-resource');
});

test('status durations count subsequent holder turns and refresh/ignore policies are deterministic', () => {
  const compiled = content({ enemyPosition: { x: 1, y: 0 } });
  const begun = start(compiled);
  assert.equal(begun.accepted, true);
  if (!begun.accepted) return;

  const selfGuard = playerCommand(compiled, begun.state, {
    type: 'use-ability',
    participantId: 'hero-seat',
    abilityId: 'self-guard',
    targetParticipantId: 'hero-seat',
  });
  assert.equal(selfGuard.accepted, true);
  if (!selfGuard.accepted) return;
  assert.equal(combatant(selfGuard.state, 'hero-seat').statuses[0].remainingHolderTurns, 2);
  assert.equal(
    getEffectiveCharacterAttributes(compiled, selfGuard.state, 'hero', 'hero-seat').power,
    5,
  );

  const nextHeroTurn = playerCommand(compiled, selfGuard.state, {
    type: 'wait',
    participantId: 'hero-seat',
  });
  assert.equal(nextHeroTurn.accepted, true);
  if (!nextHeroTurn.accepted) return;
  assert.equal(combatant(nextHeroTurn.state, 'hero-seat').statuses[0].remainingHolderTurns, 1);
  const expired = playerCommand(compiled, nextHeroTurn.state, {
    type: 'wait',
    participantId: 'hero-seat',
  });
  assert.equal(expired.accepted, true);
  if (!expired.accepted) return;
  assert.deepEqual(combatant(expired.state, 'hero-seat').statuses, []);

  const refreshCompiled = content({ enemyPosition: { x: 1, y: 0 } });
  const refreshStart = start(refreshCompiled);
  assert.equal(refreshStart.accepted, true);
  if (!refreshStart.accepted) return;
  const firstRefresh = playerCommand(refreshCompiled, refreshStart.state, {
    type: 'use-ability',
    participantId: 'hero-seat',
    abilityId: 'mark-refresh',
    targetParticipantId: 'guardian-seat',
  });
  assert.equal(firstRefresh.accepted, true);
  if (!firstRefresh.accepted) return;
  assert.equal(combatant(firstRefresh.state, 'guardian-seat').statuses[0].remainingHolderTurns, 1);
  const refreshed = playerCommand(refreshCompiled, firstRefresh.state, {
    type: 'use-ability',
    participantId: 'hero-seat',
    abilityId: 'mark-refresh',
    targetParticipantId: 'guardian-seat',
  });
  assert.equal(refreshed.accepted, true);
  if (!refreshed.accepted) return;
  assert.equal(combatant(refreshed.state, 'guardian-seat').statuses[0].remainingHolderTurns, 1);
  assert.equal(combatant(refreshed.state, 'guardian-seat').statuses[0].appliedAtRevision, 3);

  const ignoreCompiled = content({ enemyPosition: { x: 1, y: 0 } });
  const ignoreStart = start(ignoreCompiled);
  assert.equal(ignoreStart.accepted, true);
  if (!ignoreStart.accepted) return;
  const firstIgnore = playerCommand(ignoreCompiled, ignoreStart.state, {
    type: 'use-ability',
    participantId: 'hero-seat',
    abilityId: 'mark-ignore',
    targetParticipantId: 'guardian-seat',
  });
  assert.equal(firstIgnore.accepted, true);
  if (!firstIgnore.accepted) return;
  const ignored = playerCommand(ignoreCompiled, firstIgnore.state, {
    type: 'use-ability',
    participantId: 'hero-seat',
    abilityId: 'mark-ignore',
    targetParticipantId: 'guardian-seat',
  });
  assert.equal(ignored.accepted, true);
  if (!ignored.accepted) return;
  assert.deepEqual(combatant(ignored.state, 'guardian-seat').statuses, []);
});

test('a terminal player action is final and does not invent an enemy victory action', () => {
  const compiled = content({ enemyPosition: { x: 1, y: 0 } });
  const begun = start(compiled);
  assert.equal(begun.accepted, true);
  if (!begun.accepted) return;
  const won = playerCommand(compiled, begun.state, {
    type: 'use-ability',
    participantId: 'hero-seat',
    abilityId: 'lethal-mark',
    targetParticipantId: 'guardian-seat',
  });
  assert.equal(won.accepted, true);
  if (!won.accepted) return;
  assert.equal(won.state.encounter.outcome, 'victory');
  assert.equal(won.state.revision, 2);
  assert.equal(combatant(won.state, 'guardian-seat').resources.health, 0);
  assert.equal(combatant(won.state, 'guardian-seat').statuses[0].remainingHolderTurns, 2);
  const after = playerCommand(compiled, won.state, {
    type: 'wait',
    participantId: 'hero-seat',
  });
  assert.equal(after.accepted, false);
  assert.equal(after.state, won.state);
});
