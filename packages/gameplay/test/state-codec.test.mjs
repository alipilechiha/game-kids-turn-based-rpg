import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compileGameplay,
  createGameplayState,
  decodeGameplayState,
  encodeGameplayState,
  GameplayStateCodecError,
  transitionGameplay,
} from '../dist/index.js';

function content(options = {}) {
  return compileGameplay({
    schemaVersion: 1,
    id: 'codec-demo',
    contentVersion: options.contentVersion ?? 'copy-1',
    compatibilityVersion: options.compatibilityVersion ?? 'shape-1',
    movementAttributeId: 'movement',
    healthResourceId: 'health',
    progression: { maxLevel: 1, experienceThresholds: [] },
    attributes: [{ id: 'movement', minimum: 1, maximum: 4, defaultValue: 2 }],
    resources: [{ id: 'health', maximum: 10, defaultValue: 10 }],
    characters: [
      {
        id: 'hero',
        baseAttributes: { movement: 2 },
        startingResources: { health: 10 },
        startingAbilityIds: ['guard', 'finish'],
      },
      {
        id: 'guardian',
        baseAttributes: { movement: 1 },
        startingResources: { health: 5 },
      },
    ],
    items: [{ id: 'potion', stackLimit: 3 }],
    equipmentSlots: [],
    abilities: [
      {
        id: 'guard',
        resourceCosts: {},
        target: { kind: 'self', minimumRange: 0, maximumRange: 0 },
        effects: [{ op: 'apply-status', statusEffectId: 'ward' }],
      },
      {
        id: 'finish',
        resourceCosts: {},
        target: { kind: 'enemy', minimumRange: 1, maximumRange: 1 },
        effects: [{ op: 'damage', amount: 5 }],
      },
    ],
    statusEffects: [
      {
        id: 'ward',
        durationTurns: 3,
        stackingPolicy: 'refresh',
        modifiers: [{ attributeId: 'movement', amount: 1 }],
      },
    ],
    boards: [{ id: 'arena', width: 3, height: 1, blockedCells: [] }],
    encounters: [
      {
        id: 'trial',
        boardId: 'arena',
        maxTurns: options.maxTurns ?? 5,
        allowWithdrawal: true,
        participants: [
          {
            id: 'hero-seat',
            characterId: 'hero',
            team: 'player',
            position: { x: 0, y: 0 },
            initiative: 2,
          },
          {
            id: 'guardian-seat',
            characterId: 'guardian',
            team: 'enemy',
            position: options.enemyPosition ?? { x: 2, y: 0 },
            initiative: 1,
          },
        ],
        victoryRewards: { experience: [{ characterId: 'hero', amount: 1 }] },
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

function start(compiled, state, instanceId = 'codec-trial') {
  return transitionGameplay(compiled, state, {
    type: 'start-encounter',
    playthroughId: state.playthroughId,
    expectedRevision: state.revision,
    encounterId: 'trial',
    instanceId,
  });
}

function playerIntent(compiled, state, intent) {
  return transitionGameplay(compiled, state, {
    ...intent,
    playthroughId: state.playthroughId,
    encounterInstanceId: state.encounter.instanceId,
    expectedRevision: state.revision,
  });
}

test('encodes canonical versioned JSON and decodes an immutable compatible snapshot', () => {
  const compiled = content();
  const state = createGameplayState(compiled, 'playthrough-a');
  const encoded = encodeGameplayState(compiled, state);
  const decoded = decodeGameplayState(compiled, JSON.parse(encoded));
  assert.equal(decoded.ok, true);
  if (!decoded.ok) return;
  assert.deepEqual(decoded.state, state);
  assert.notEqual(decoded.state, state);
  assert.ok(Object.isFrozen(decoded.state));
  assert.ok(Object.isFrozen(decoded.state.characterProgress.hero));
  assert.equal(encodeGameplayState(compiled, decoded.state), encoded);
  assert.throws(
    () => encodeGameplayState(compiled, { ...state, revision: -1 }),
    GameplayStateCodecError,
  );
});

test('restores a mid-combat status duration and preserves stale-command rejection', () => {
  const compiled = content();
  const fresh = createGameplayState(compiled, 'playthrough-a');
  const begun = start(compiled, fresh);
  assert.equal(begun.accepted, true);
  if (!begun.accepted) return;
  const guardCommand = {
    type: 'use-ability',
    participantId: 'hero-seat',
    abilityId: 'guard',
    targetParticipantId: 'hero-seat',
    playthroughId: begun.state.playthroughId,
    encounterInstanceId: begun.state.encounter.instanceId,
    expectedRevision: begun.state.revision,
  };
  const guarded = transitionGameplay(compiled, begun.state, guardCommand);
  assert.equal(guarded.accepted, true);
  if (!guarded.accepted) return;
  const savedStatus = guarded.state.encounter.combatants[0].statuses[0];
  assert.equal(savedStatus.remainingHolderTurns, 3);

  const decoded = decodeGameplayState(
    compiled,
    JSON.parse(encodeGameplayState(compiled, guarded.state)),
  );
  assert.equal(decoded.ok, true);
  if (!decoded.ok) return;
  assert.equal(decoded.state.encounter.combatants[0].statuses[0].remainingHolderTurns, 3);
  const continued = playerIntent(compiled, guarded.state, {
    type: 'wait',
    participantId: 'hero-seat',
  });
  const restoredContinuation = playerIntent(compiled, decoded.state, {
    type: 'wait',
    participantId: 'hero-seat',
  });
  assert.deepEqual(restoredContinuation, continued);

  const replayed = transitionGameplay(compiled, decoded.state, guardCommand);
  assert.equal(replayed.accepted, false);
  assert.equal(replayed.state, decoded.state);
  if (!replayed.accepted) assert.equal(replayed.reason.code, 'stale-revision');
});

test('restores terminal outcome and blocks duplicate reward or encounter-instance replay', () => {
  const compiled = content({ enemyPosition: { x: 1, y: 0 } });
  const fresh = createGameplayState(compiled, 'playthrough-a');
  const begun = start(compiled, fresh, 'finished-trial');
  assert.equal(begun.accepted, true);
  if (!begun.accepted) return;
  const victory = playerIntent(compiled, begun.state, {
    type: 'use-ability',
    participantId: 'hero-seat',
    abilityId: 'finish',
    targetParticipantId: 'guardian-seat',
  });
  assert.equal(victory.accepted, true);
  if (!victory.accepted) return;
  const decoded = decodeGameplayState(
    compiled,
    JSON.parse(encodeGameplayState(compiled, victory.state)),
  );
  assert.equal(decoded.ok, true);
  if (!decoded.ok) return;
  assert.equal(decoded.state.characterProgress.hero.experience, 1);
  assert.deepEqual(decoded.state.outcomeMarkers, victory.state.outcomeMarkers);
  const duplicateStart = start(compiled, decoded.state, 'finished-trial');
  assert.equal(duplicateStart.accepted, false);
  assert.equal(duplicateStart.state, decoded.state);
});

test('round-trips turn-limit and withdrawal terminal outcomes', () => {
  const limited = content({ maxTurns: 1 });
  const fresh = createGameplayState(limited, 'playthrough-limit');
  const begun = start(limited, fresh, 'limited-instance');
  assert.equal(begun.accepted, true);
  if (!begun.accepted) return;
  const ended = playerIntent(limited, begun.state, {
    type: 'wait',
    participantId: 'hero-seat',
  });
  assert.equal(ended.accepted, true);
  if (!ended.accepted) return;
  assert.equal(ended.state.encounter.outcome, 'turn-limit');
  assert.equal(
    decodeGameplayState(limited, JSON.parse(encodeGameplayState(limited, ended.state))).ok,
    true,
  );

  const withdrawDefinition = content();
  const withdrawFresh = createGameplayState(withdrawDefinition, 'playthrough-withdraw');
  const withdrawStart = start(withdrawDefinition, withdrawFresh, 'withdraw-instance');
  assert.equal(withdrawStart.accepted, true);
  if (!withdrawStart.accepted) return;
  const withdrawn = playerIntent(withdrawDefinition, withdrawStart.state, { type: 'withdraw' });
  assert.equal(withdrawn.accepted, true);
  if (!withdrawn.accepted) return;
  assert.equal(withdrawn.state.encounter.outcome, 'withdrawn');
  assert.equal(
    decodeGameplayState(
      withdrawDefinition,
      JSON.parse(encodeGameplayState(withdrawDefinition, withdrawn.state)),
    ).ok,
    true,
  );
});

test('distinguishes unsupported schemas and structural incompatibility from copy updates', () => {
  const original = content();
  const state = createGameplayState(original, 'playthrough-a');
  const payload = JSON.parse(encodeGameplayState(original, state));

  const unsupported = decodeGameplayState(original, { ...payload, schemaVersion: 2 });
  assert.equal(unsupported.ok, false);
  if (!unsupported.ok) assert.equal(unsupported.reason.code, 'unsupported-schema');

  const copyOnly = content({ contentVersion: 'copy-2' });
  const compatible = decodeGameplayState(copyOnly, payload);
  assert.equal(compatible.ok, true);

  const structural = content({ compatibilityVersion: 'shape-2' });
  const incompatible = decodeGameplayState(structural, payload);
  assert.equal(incompatible.ok, false);
  if (!incompatible.ok) assert.equal(incompatible.reason.code, 'incompatible-definition');
});

test('rejects corrupt state keys, quantities, resources, cursors, and non-JSON structures', () => {
  const compiled = content();
  const state = createGameplayState(compiled, 'playthrough-a');
  const payload = JSON.parse(encodeGameplayState(compiled, state));
  for (const corrupt of [
    { ...payload, inventory: { unknown: 1 } },
    { ...payload, inventory: { potion: -1 } },
    { ...payload, encounter: { invalid: true } },
    { ...payload, playthroughId: '__proto__' },
    { ...payload, revision: Number.MAX_SAFE_INTEGER + 1 },
  ]) {
    const result = decodeGameplayState(compiled, corrupt);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason.code, 'invalid-state');
  }

  const cyclic = {};
  cyclic.self = cyclic;
  const cyclicResult = decodeGameplayState(compiled, cyclic);
  assert.equal(cyclicResult.ok, false);
  if (!cyclicResult.ok) assert.equal(cyclicResult.reason.code, 'invalid-state');

  const unsafe = { ...payload, inventory: JSON.parse('{"__proto__":1}') };
  assert.equal(decodeGameplayState(compiled, unsafe).ok, false);

  const begun = start(compiled, state);
  assert.equal(begun.accepted, true);
  if (!begun.accepted) return;
  const invalidHealth = JSON.parse(encodeGameplayState(compiled, begun.state));
  invalidHealth.encounter.combatants[0].resources.health = -1;
  const invalidHealthResult = decodeGameplayState(compiled, invalidHealth);
  assert.equal(invalidHealthResult.ok, false);
  if (!invalidHealthResult.ok) assert.equal(invalidHealthResult.reason.code, 'invalid-state');
});
