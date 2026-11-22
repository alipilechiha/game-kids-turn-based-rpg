import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyGameplayGrant,
  compileGameplay,
  createGameplayState,
  getCharacterAttributes,
  getCharacterLevel,
  getUnlockedAbilityIds,
  transitionGameplay,
} from '../dist/index.js';

function content(inventoryCapacity = 2) {
  return compileGameplay({
    schemaVersion: 1,
    id: 'demo',
    contentVersion: 'copy-1',
    compatibilityVersion: 'shape-1',
    movementAttributeId: 'movement',
    healthResourceId: 'health',
    inventoryCapacity,
    attributes: [
      { id: 'strength', minimum: 0, maximum: 10, defaultValue: 1 },
      { id: 'movement', minimum: 1, maximum: 8, defaultValue: 2 },
    ],
    resources: [{ id: 'health', maximum: 10, defaultValue: 10 }],
    progression: {
      maxLevel: 3,
      experienceThresholds: [100, 200],
      abilityUnlocks: [{ level: 2, abilityId: 'focus' }],
    },
    characters: [
      {
        id: 'hero',
        baseAttributes: { strength: 4, movement: 3 },
        startingResources: { health: 10 },
        startingAbilityIds: ['basic'],
      },
    ],
    items: [
      {
        id: 'sword',
        stackLimit: 1,
        unique: true,
        equipment: {
          slotId: 'weapon',
          requirements: [{ attributeId: 'strength', minimum: 4 }],
          modifiers: [{ attributeId: 'strength', amount: 2 }],
          grantedAbilityIds: ['focus'],
        },
      },
      { id: 'herb', stackLimit: 3 },
      {
        id: 'heavy-sword',
        stackLimit: 1,
        equipment: {
          slotId: 'weapon',
          requirements: [{ attributeId: 'strength', minimum: 7 }],
          modifiers: [{ attributeId: 'strength', amount: 1 }],
        },
      },
      { id: 'gem', stackLimit: 1 },
    ],
    equipmentSlots: [{ id: 'weapon' }],
    abilities: [
      {
        id: 'basic',
        resourceCosts: {},
        target: { kind: 'self', minimumRange: 0, maximumRange: 0 },
        effects: [{ op: 'heal', amount: 1 }],
      },
      {
        id: 'focus',
        resourceCosts: {},
        target: { kind: 'self', minimumRange: 0, maximumRange: 0 },
        effects: [{ op: 'heal', amount: 1 }],
      },
    ],
    statusEffects: [],
    boards: [],
    encounters: [],
  });
}

test('creates an immutable playthrough and derives level and explicit unlocks from bounded experience', () => {
  const compiled = content();
  const fresh = createGameplayState(compiled, 'play-one');
  assert.equal(fresh.revision, 0);
  assert.equal(getCharacterLevel(compiled, fresh, 'hero'), 1);
  assert.deepEqual(fresh.characterProgress.hero, { experience: 0 });
  assert.deepEqual(getUnlockedAbilityIds(compiled, fresh, 'hero'), ['basic']);

  const result = applyGameplayGrant(compiled, fresh, {
    playthroughId: 'play-one',
    expectedRevision: 0,
    rewardId: 'quest-reward',
    experience: [{ characterId: 'hero', amount: 100 }],
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) return;
  assert.equal(result.state.revision, 1);
  assert.equal(getCharacterLevel(compiled, result.state, 'hero'), 2);
  assert.deepEqual(getUnlockedAbilityIds(compiled, result.state, 'hero'), ['basic', 'focus']);
  assert.equal(fresh.characterProgress.hero.experience, 0);
});

test('grant is atomic, enforces unique/stack/capacity limits, and deduplicates its stable reward ID', () => {
  const compiled = content();
  const state = createGameplayState(compiled, 'play-one');
  const grant = applyGameplayGrant(compiled, state, {
    playthroughId: 'play-one',
    expectedRevision: 0,
    rewardId: 'starter-kit',
    items: [
      { itemId: 'sword', quantity: 1 },
      { itemId: 'herb', quantity: 3 },
    ],
  });
  assert.equal(grant.accepted, true);
  if (!grant.accepted) return;
  assert.deepEqual(grant.state.inventory, { sword: 1, herb: 3 });

  const duplicate = applyGameplayGrant(compiled, grant.state, {
    playthroughId: 'play-one',
    expectedRevision: 1,
    rewardId: 'starter-kit',
    items: [{ itemId: 'sword', quantity: 1 }],
  });
  assert.equal(duplicate.accepted, false);
  assert.equal(duplicate.state, grant.state);
  if (duplicate.accepted) return;
  assert.equal(duplicate.reason.code, 'reward-already-applied');

  const tooMuch = applyGameplayGrant(compiled, grant.state, {
    playthroughId: 'play-one',
    expectedRevision: 1,
    rewardId: 'overflow-kit',
    items: [{ itemId: 'gem', quantity: 1 }],
  });
  assert.equal(tooMuch.accepted, false);
  assert.equal(tooMuch.state, grant.state);
  if (tooMuch.accepted) return;
  assert.equal(tooMuch.reason.code, 'inventory-capacity');

  const overUnique = applyGameplayGrant(compiled, grant.state, {
    playthroughId: 'play-one',
    expectedRevision: 1,
    rewardId: 'duplicate-sword',
    items: [{ itemId: 'sword', quantity: 1 }],
  });
  assert.equal(overUnique.accepted, false);
  assert.equal(overUnique.state, grant.state);
  if (overUnique.accepted) return;
  assert.equal(overUnique.reason.code, 'item-unavailable');
});

test('consumption is bounded and equipment recomputes modifiers without accumulating them', () => {
  const compiled = content(3);
  const state = createGameplayState(compiled, 'play-one');
  const grant = applyGameplayGrant(compiled, state, {
    playthroughId: 'play-one',
    expectedRevision: 0,
    rewardId: 'starter',
    items: [
      { itemId: 'sword', quantity: 1 },
      { itemId: 'heavy-sword', quantity: 1 },
      { itemId: 'herb', quantity: 3 },
    ],
  });
  assert.equal(grant.accepted, true);
  if (!grant.accepted) return;

  const equipped = transitionGameplay(compiled, grant.state, {
    type: 'equip-item',
    playthroughId: 'play-one',
    expectedRevision: 1,
    characterId: 'hero',
    slotId: 'weapon',
    itemId: 'sword',
  });
  assert.equal(equipped.accepted, true);
  if (!equipped.accepted) return;
  assert.equal(getCharacterAttributes(compiled, equipped.state, 'hero').strength, 6);

  const reequipped = transitionGameplay(compiled, equipped.state, {
    type: 'equip-item',
    playthroughId: 'play-one',
    expectedRevision: 2,
    characterId: 'hero',
    slotId: 'weapon',
    itemId: 'sword',
  });
  assert.equal(reequipped.accepted, true);
  if (!reequipped.accepted) return;
  assert.equal(getCharacterAttributes(compiled, reequipped.state, 'hero').strength, 6);

  const ineligible = transitionGameplay(compiled, reequipped.state, {
    type: 'equip-item',
    playthroughId: 'play-one',
    expectedRevision: 3,
    characterId: 'hero',
    slotId: 'weapon',
    itemId: 'heavy-sword',
  });
  assert.equal(ineligible.accepted, false);
  assert.equal(ineligible.state, reequipped.state);
  if (ineligible.accepted) return;
  assert.equal(ineligible.reason.code, 'equipment-ineligible');

  const unequipped = transitionGameplay(compiled, reequipped.state, {
    type: 'unequip-item',
    playthroughId: 'play-one',
    expectedRevision: 3,
    characterId: 'hero',
    slotId: 'weapon',
  });
  assert.equal(unequipped.accepted, true);
  if (!unequipped.accepted) return;
  assert.equal(getCharacterAttributes(compiled, unequipped.state, 'hero').strength, 4);
  assert.deepEqual(unequipped.state.inventory, { sword: 1, 'heavy-sword': 1, herb: 3 });

  const consumed = transitionGameplay(compiled, unequipped.state, {
    type: 'consume-item',
    playthroughId: 'play-one',
    expectedRevision: 4,
    itemId: 'herb',
    quantity: 2,
  });
  assert.equal(consumed.accepted, true);
  if (!consumed.accepted) return;
  assert.equal(consumed.state.inventory.herb, 1);

  const insufficient = transitionGameplay(compiled, consumed.state, {
    type: 'consume-item',
    playthroughId: 'play-one',
    expectedRevision: 5,
    itemId: 'herb',
    quantity: 2,
  });
  assert.equal(insufficient.accepted, false);
  assert.equal(insufficient.state, consumed.state);
  if (insufficient.accepted) return;
  assert.equal(insufficient.reason.code, 'item-unavailable');
});
