import {
  applyGameplayGrant,
  compileGameplay,
  createGameplayState,
  decodeGameplayState,
  encodeGameplayState,
  getCharacterAttributes,
  getCharacterLevel,
  getInventorySlotCount,
  getUnlockedAbilityIds,
  transitionGameplay,
  validateGameplay,
} from 'waypoint-rpg-gameplay';
import { describe, expect, it } from 'vitest';
import { gardenGameplayDefinition } from '../src/content/gameplay.js';

describe('Garden sample gameplay package definition and APIs', () => {
  it('validates, compiles, progresses, grants, equips and decodes a package-owned snapshot', () => {
    expect(validateGameplay(gardenGameplayDefinition).ok).toBe(true);
    const gameplay = compileGameplay(gardenGameplayDefinition);
    let state = createGameplayState(gameplay, 'gameplay-api-test');

    const invalidUse = transitionGameplay(gameplay, state, {
      type: 'consume-item',
      itemId: 'special-seed',
      quantity: 1,
      playthroughId: state.playthroughId,
      expectedRevision: state.revision,
    });
    expect(invalidUse.accepted).toBe(false);
    expect(invalidUse.state).toBe(state);

    const seed = applyGameplayGrant(gameplay, state, {
      playthroughId: state.playthroughId,
      expectedRevision: state.revision,
      rewardId: 'sample-seed',
      items: [{ itemId: 'special-seed', quantity: 1 }],
    });
    expect(seed.accepted).toBe(true);
    if (!seed.accepted) return;
    state = seed.state;
    expect(state.inventory['special-seed']).toBe(1);
    expect(getInventorySlotCount(gameplay, state)).toBe(1);

    const consumed = transitionGameplay(gameplay, state, {
      type: 'consume-item',
      itemId: 'special-seed',
      quantity: 1,
      playthroughId: state.playthroughId,
      expectedRevision: state.revision,
    });
    expect(consumed.accepted).toBe(true);
    if (!consumed.accepted) return;
    state = consumed.state;
    expect(state.inventory['special-seed']).toBeUndefined();

    const reward = applyGameplayGrant(gameplay, state, {
      playthroughId: state.playthroughId,
      expectedRevision: state.revision,
      rewardId: 'sample-garden-restoration',
      experience: [{ characterId: 'garden-hero', amount: 24 }],
      items: [
        { itemId: 'garden-reward', quantity: 1 },
        { itemId: 'lantern-charm', quantity: 1 },
      ],
      equipment: [{ characterId: 'garden-hero', itemId: 'lantern-charm', slotId: 'charm' }],
    });
    expect(reward.accepted).toBe(true);
    if (!reward.accepted) return;
    state = reward.state;
    expect(state.characterProgress['garden-hero']?.experience).toBe(24);
    expect(getInventorySlotCount(gameplay, state)).toBe(2);
    expect(getCharacterLevel(gameplay, state, 'garden-hero')).toBe(2);
    expect(getUnlockedAbilityIds(gameplay, state, 'garden-hero')).toContain('star-bloom');
    expect(getCharacterAttributes(gameplay, state, 'garden-hero').steps).toBe(3);

    const overCapacity = applyGameplayGrant(gameplay, state, {
      playthroughId: state.playthroughId,
      expectedRevision: state.revision,
      rewardId: 'sample-capacity-overflow',
      items: [{ itemId: 'special-seed', quantity: 1 }],
    });
    expect(overCapacity.accepted).toBe(false);
    expect(overCapacity.state).toBe(state);
    if (!overCapacity.accepted) expect(overCapacity.reason.code).toBe('inventory-capacity');

    const encoded = encodeGameplayState(gameplay, state);
    const decoded = decodeGameplayState(gameplay, JSON.parse(encoded));
    expect(decoded).toMatchObject({ ok: true, state });
  });

  it('rejects duplicate trusted grants without changing package state', () => {
    const gameplay = compileGameplay(gardenGameplayDefinition);
    const initial = createGameplayState(gameplay, 'gameplay-idempotency-test');
    const first = applyGameplayGrant(gameplay, initial, {
      playthroughId: initial.playthroughId,
      expectedRevision: initial.revision,
      rewardId: 'one-time-garden-seed',
      items: [{ itemId: 'special-seed', quantity: 1 }],
    });
    expect(first.accepted).toBe(true);
    if (!first.accepted) return;
    const duplicate = applyGameplayGrant(gameplay, first.state, {
      playthroughId: first.state.playthroughId,
      expectedRevision: first.state.revision,
      rewardId: 'one-time-garden-seed',
      items: [{ itemId: 'special-seed', quantity: 1 }],
    });
    expect(duplicate.accepted).toBe(false);
    expect(duplicate.state).toBe(first.state);
    if (!duplicate.accepted) expect(duplicate.reason.code).toBe('reward-already-applied');
  });
});
