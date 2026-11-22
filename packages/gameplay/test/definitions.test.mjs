import assert from 'node:assert/strict';
import test from 'node:test';
import { compileGameplay, GameplayDefinitionError, validateGameplay } from '../dist/index.js';

function definition() {
  return {
    schemaVersion: 1,
    id: 'demo',
    contentVersion: 'copy-1',
    compatibilityVersion: 'shape-1',
    movementAttributeId: 'movement',
    healthResourceId: 'health',
    inventoryCapacity: 8,
    attributes: [
      { id: 'strength', minimum: 0, maximum: 20, defaultValue: 2 },
      { id: 'movement', minimum: 1, maximum: 8, defaultValue: 3 },
    ],
    resources: [
      { id: 'health', maximum: 20, defaultValue: 20 },
      { id: 'focus', maximum: 8, defaultValue: 4 },
    ],
    progression: {
      maxLevel: 3,
      experienceThresholds: [100, 250],
      abilityUnlocks: [{ level: 2, abilityId: 'heavy-strike' }],
    },
    characters: [
      {
        id: 'hero',
        baseAttributes: { strength: 3, movement: 4 },
        startingResources: { health: 20, focus: 4 },
        startingAbilityIds: ['heavy-strike'],
      },
      { id: 'guardian', baseAttributes: { strength: 2, movement: 2 } },
    ],
    items: [
      {
        id: 'iron-sword',
        stackLimit: 1,
        unique: true,
        equipment: {
          slotId: 'weapon',
          requirements: [{ attributeId: 'strength', minimum: 2 }],
          modifiers: [{ attributeId: 'strength', amount: 2 }],
          grantedAbilityIds: ['heavy-strike'],
        },
      },
      { id: 'herb', stackLimit: 5 },
    ],
    equipmentSlots: [{ id: 'weapon' }, { id: 'charm' }],
    abilities: [
      {
        id: 'heavy-strike',
        resourceCosts: { focus: 2 },
        target: { kind: 'enemy', minimumRange: 1, maximumRange: 2 },
        requirements: [{ attributeId: 'strength', minimum: 2 }],
        effects: [{ op: 'damage', amount: 4 }],
      },
      {
        id: 'focus-guard',
        resourceCosts: {},
        target: { kind: 'self', minimumRange: 0, maximumRange: 0 },
        effects: [{ op: 'apply-status', statusEffectId: 'guarded' }],
      },
    ],
    statusEffects: [
      {
        id: 'guarded',
        durationTurns: 2,
        stackingPolicy: 'refresh',
        modifiers: [{ attributeId: 'strength', amount: 1 }],
      },
    ],
    boards: [{ id: 'arena', width: 5, height: 5, blockedCells: [{ x: 2, y: 2 }] }],
    encounters: [
      {
        id: 'guardian-trial',
        boardId: 'arena',
        maxTurns: 12,
        allowWithdrawal: true,
        participants: [
          {
            id: 'hero-seat',
            characterId: 'hero',
            team: 'player',
            position: { x: 0, y: 0 },
            initiative: 5,
          },
          {
            id: 'guardian-seat',
            characterId: 'guardian',
            team: 'enemy',
            position: { x: 4, y: 4 },
            initiative: 2,
          },
        ],
        victoryRewards: {
          experience: [{ characterId: 'hero', amount: 25 }],
          items: [{ itemId: 'iron-sword', quantity: 1 }],
          equipment: [{ characterId: 'hero', itemId: 'iron-sword', slotId: 'weapon' }],
        },
        outcomeMappings: [
          { outcome: 'victory', consequenceId: 'guardian-won' },
          { outcome: 'defeat', consequenceId: 'guardian-lost' },
          { outcome: 'turn-limit', consequenceId: 'guardian-timeout' },
          { outcome: 'withdrawn', consequenceId: 'guardian-withdrawn' },
        ],
      },
    ],
  };
}

test('accepts a complete game-neutral definition and compiles a defensive immutable copy', () => {
  const authoring = definition();
  const compiled = compileGameplay(authoring);

  assert.equal(compiled.id, 'demo');
  assert.equal(compiled.definition.encounters[0].id, 'guardian-trial');
  assert.notEqual(compiled.definition, authoring);
  assert.notEqual(compiled.definition.characters, authoring.characters);
  authoring.characters[0].baseAttributes.strength = 19;
  authoring.encounters[0].participants[0].position.x = 3;
  assert.equal(compiled.definition.characters[0].baseAttributes.strength, 3);
  assert.equal(compiled.definition.encounters[0].participants[0].position.x, 0);
  assert.equal(Object.isFrozen(compiled), true);
  assert.equal(Object.isFrozen(compiled.definition.encounters[0].participants[0].position), true);
  assert.equal(Object.isFrozen(compiled.definition.characters[0].baseAttributes), true);
  assert.equal(validateGameplay(definition()).ok, true);
});

test('reports duplicate IDs, missing references, invalid dimensions, and invalid outcome coverage', () => {
  const invalid = definition();
  invalid.items[1].stackLimit = 0;
  invalid.items.push({ id: 'herb', stackLimit: 2 });
  invalid.abilities[0].resourceCosts.missing = 1;
  invalid.encounters[0].participants[0].characterId = 'missing-character';
  invalid.encounters[0].participants[1].position.x = 5;
  invalid.encounters[0].outcomeMappings = invalid.encounters[0].outcomeMappings.filter(
    (mapping) => mapping.outcome !== 'withdrawn',
  );

  const report = validateGameplay(invalid);
  assert.equal(report.ok, false);
  assert.ok(report.errorCount >= 5);
  assert.ok(
    report.diagnostics.some((item) => item.code === 'duplicate-id' && item.path.includes('items')),
  );
  assert.ok(
    report.diagnostics.some(
      (item) => item.code === 'missing-reference' && item.path.includes('resourceCosts'),
    ),
  );
  assert.ok(
    report.diagnostics.some(
      (item) => item.code === 'invalid-number' && item.path.includes('stackLimit'),
    ),
  );
  assert.ok(
    report.diagnostics.some(
      (item) => item.code === 'invalid-number' && item.path.includes('position'),
    ),
  );
  assert.ok(report.diagnostics.some((item) => item.code === 'missing-outcome-mapping'));
});

test('rejects malformed JSON values and unsafe object keys without executing accessors', () => {
  const cyclic = definition();
  cyclic.self = cyclic;
  assert.ok(validateGameplay(cyclic).diagnostics.some((item) => item.code === 'invalid-json'));

  const unsafe = definition();
  unsafe.characters[0].baseAttributes = JSON.parse('{"__proto__":3,"movement":4}');
  assert.ok(validateGameplay(unsafe).diagnostics.some((item) => item.code === 'unsafe-key'));

  let invoked = false;
  const accessor = definition();
  Object.defineProperty(accessor, 'secret', {
    enumerable: true,
    get() {
      invoked = true;
      throw new Error('must not execute');
    },
  });
  assert.ok(validateGameplay(accessor).diagnostics.some((item) => item.code === 'invalid-json'));
  assert.equal(invoked, false);
  assert.throws(() => compileGameplay(accessor), GameplayDefinitionError);

  const hidden = definition();
  Object.defineProperty(hidden, 'hiddenContent', { value: 'not JSON', enumerable: false });
  assert.ok(validateGameplay(hidden).diagnostics.some((item) => item.code === 'invalid-json'));
});

test('rejects inconsistent attributes, progression thresholds, reward ownership, and duplicate cells', () => {
  const invalid = definition();
  invalid.progression.experienceThresholds = [250, 100];
  invalid.characters[0].baseAttributes.unlisted = 1;
  invalid.encounters[0].victoryRewards.equipment[0].itemId = 'herb';
  invalid.boards[0].blockedCells.push({ x: 2, y: 2 });

  const report = validateGameplay(invalid);
  assert.equal(report.ok, false);
  assert.ok(report.diagnostics.some((item) => item.code === 'progression-thresholds'));
  assert.ok(
    report.diagnostics.some(
      (item) => item.code === 'missing-reference' && item.path.includes('baseAttributes'),
    ),
  );
  assert.ok(report.diagnostics.some((item) => item.code === 'reward-equipment'));
  assert.ok(report.diagnostics.some((item) => item.code === 'duplicate-cell'));
});
