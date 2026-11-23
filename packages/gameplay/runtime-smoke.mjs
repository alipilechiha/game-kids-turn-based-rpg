import assert from 'node:assert/strict';
import { log } from 'node:console';
import {
  applyGameplayGrant,
  compileGameplay,
  createGameplayState,
  decodeGameplayState,
  encodeGameplayState,
  getCharacterLevel,
  getUnlockedAbilityIds,
} from 'waypoint-rpg-gameplay';

const definition = compileGameplay({
  schemaVersion: 1,
  id: 'node-minimum-gameplay',
  contentVersion: 'smoke-1',
  compatibilityVersion: 'smoke-1',
  movementAttributeId: 'movement',
  healthResourceId: 'health',
  inventoryCapacity: 1,
  attributes: [{ id: 'movement', minimum: 1, maximum: 5, defaultValue: 2 }],
  resources: [{ id: 'health', maximum: 10, defaultValue: 10 }],
  progression: {
    maxLevel: 2,
    experienceThresholds: [10],
    abilityUnlocks: [{ level: 2, abilityId: 'focus' }],
  },
  characters: [
    {
      id: 'hero',
      baseAttributes: { movement: 2 },
      startingResources: { health: 10 },
      startingAbilityIds: ['spark'],
    },
  ],
  items: [],
  equipmentSlots: [],
  abilities: [
    {
      id: 'spark',
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

const initial = createGameplayState(definition, 'node-22-minimum-probe');
assert.equal(getCharacterLevel(definition, initial, 'hero'), 1);
const granted = applyGameplayGrant(definition, initial, {
  playthroughId: initial.playthroughId,
  expectedRevision: initial.revision,
  rewardId: 'minimum-probe-xp',
  experience: [{ characterId: 'hero', amount: 10 }],
});
assert.equal(granted.accepted, true);
if (!granted.accepted) throw new Error('The deterministic gameplay grant was rejected.');
assert.equal(getCharacterLevel(definition, granted.state, 'hero'), 2);
assert.deepEqual(getUnlockedAbilityIds(definition, granted.state, 'hero'), ['spark', 'focus']);
const restored = decodeGameplayState(definition, JSON.parse(encodeGameplayState(granted.state)));
assert.equal(restored.ok, true);
if (!restored.ok) throw new Error('The gameplay snapshot did not decode.');
assert.equal(restored.state.playthroughId, 'node-22-minimum-probe');

log('gameplay package native ESM runtime and snapshot codec passed');
