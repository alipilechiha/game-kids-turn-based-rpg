import type { GameplayDefinition } from 'waypoint-rpg-gameplay';

/** Garden-owned progression, items, abilities, and friendly tactical challenge. */
export const gardenGameplayDefinition: GameplayDefinition = {
  schemaVersion: 1,
  id: 'garden-adventure-gameplay',
  contentVersion: '1.0.0',
  compatibilityVersion: 'garden-gameplay-v1',
  movementAttributeId: 'steps',
  healthResourceId: 'hearts',
  inventoryCapacity: 2,
  attributes: [
    { id: 'steps', minimum: 1, maximum: 5, defaultValue: 2 },
    { id: 'resonance', minimum: 0, maximum: 5, defaultValue: 1 },
  ],
  resources: [
    { id: 'hearts', maximum: 10, defaultValue: 10 },
    { id: 'starlight', maximum: 5, defaultValue: 5 },
  ],
  progression: {
    maxLevel: 2,
    experienceThresholds: [20],
    abilityUnlocks: [{ level: 2, abilityId: 'star-bloom' }],
  },
  characters: [
    {
      id: 'garden-hero',
      baseAttributes: { steps: 2, resonance: 2 },
      startingResources: { hearts: 10, starlight: 5 },
      startingAbilityIds: ['light-ray', 'gentle-ward'],
    },
    {
      id: 'garden-guardian',
      baseAttributes: { steps: 2, resonance: 1 },
      startingResources: { hearts: 8, starlight: 2 },
      startingAbilityIds: ['pollen-spark'],
    },
  ],
  items: [
    { id: 'special-seed', stackLimit: 1, unique: true },
    { id: 'garden-reward', stackLimit: 1, unique: true },
    {
      id: 'lantern-charm',
      stackLimit: 1,
      unique: true,
      equipment: {
        slotId: 'charm',
        modifiers: [{ attributeId: 'steps', amount: 1 }],
      },
    },
  ],
  equipmentSlots: [{ id: 'charm' }],
  abilities: [
    {
      id: 'light-ray',
      resourceCosts: { starlight: 2 },
      target: { kind: 'enemy', minimumRange: 1, maximumRange: 3 },
      effects: [{ op: 'damage', amount: 4 }],
    },
    {
      id: 'gentle-ward',
      resourceCosts: { starlight: 1 },
      target: { kind: 'self', minimumRange: 0, maximumRange: 0 },
      effects: [{ op: 'apply-status', statusEffectId: 'steady-glow' }],
    },
    {
      id: 'star-bloom',
      resourceCosts: { starlight: 2 },
      target: { kind: 'enemy', minimumRange: 1, maximumRange: 4 },
      effects: [{ op: 'damage', amount: 6 }],
    },
    {
      id: 'pollen-spark',
      resourceCosts: { starlight: 0 },
      target: { kind: 'enemy', minimumRange: 1, maximumRange: 2 },
      effects: [
        { op: 'damage', amount: 1 },
        { op: 'apply-status', statusEffectId: 'pollen-dusted' },
      ],
    },
  ],
  statusEffects: [
    {
      id: 'steady-glow',
      durationTurns: 2,
      stackingPolicy: 'refresh',
      modifiers: [{ attributeId: 'steps', amount: 1 }],
    },
    {
      id: 'pollen-dusted',
      durationTurns: 1,
      stackingPolicy: 'refresh',
      modifiers: [{ attributeId: 'steps', amount: -1 }],
    },
  ],
  boards: [
    {
      id: 'lantern-court',
      width: 5,
      height: 5,
      blockedCells: [{ x: 2, y: 4 }],
    },
  ],
  encounters: [
    {
      id: 'guardian-trial',
      boardId: 'lantern-court',
      maxTurns: 12,
      allowWithdrawal: true,
      participants: [
        {
          id: 'hero-seat',
          characterId: 'garden-hero',
          team: 'player',
          position: { x: 0, y: 2 },
          initiative: 10,
        },
        {
          id: 'guardian-seat',
          characterId: 'garden-guardian',
          team: 'enemy',
          position: { x: 4, y: 2 },
          initiative: 5,
        },
      ],
      victoryRewards: {
        experience: [{ characterId: 'garden-hero', amount: 24 }],
        items: [
          { itemId: 'garden-reward', quantity: 1 },
          { itemId: 'lantern-charm', quantity: 1 },
        ],
        equipment: [{ characterId: 'garden-hero', itemId: 'lantern-charm', slotId: 'charm' }],
      },
      outcomeMappings: [
        { outcome: 'victory', consequenceId: 'guardian-victory' },
        { outcome: 'defeat', consequenceId: 'guardian-retry' },
        { outcome: 'turn-limit', consequenceId: 'guardian-retry' },
        { outcome: 'withdrawn', consequenceId: 'guardian-retry' },
      ],
    },
  ],
};
