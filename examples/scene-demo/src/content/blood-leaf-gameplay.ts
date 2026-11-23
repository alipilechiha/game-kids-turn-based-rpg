import { compileGameplay, type GameplayDefinition } from 'waypoint-rpg-gameplay';

/** Maps gameplay consequence IDs to narrative trigger IDs (app-owned bridge). */
export const CONSEQUENCE_TO_TRIGGER = {
  'trial-won': 'guardian-trial-won',
  'trial-lost': 'guardian-trial-lost',
  'trial-timeout': 'guardian-trial-lost',
  'trial-withdrew': 'guardian-trial-lost',
} as const;

export type TrialConsequenceId = keyof typeof CONSEQUENCE_TO_TRIGGER;

export const GUARDIAN_TRIAL_ENCOUNTER_ID = 'courtyard-guardian-trial';

export const bloodLeafGameplayDefinition = {
  schemaVersion: 1,
  id: 'blood-leaf-demo',
  contentVersion: 'blood-leaf-gameplay-copy-1',
  compatibilityVersion: 'blood-leaf-gameplay-shape-1',
  movementAttributeId: 'movement',
  healthResourceId: 'health',
  inventoryCapacity: 4,
  attributes: [
    { id: 'strength', minimum: 0, maximum: 10, defaultValue: 2 },
    { id: 'movement', minimum: 1, maximum: 8, defaultValue: 3 },
  ],
  resources: [
    { id: 'health', maximum: 12, defaultValue: 12 },
    { id: 'focus', maximum: 4, defaultValue: 4 },
  ],
  progression: {
    maxLevel: 2,
    experienceThresholds: [50],
    abilityUnlocks: [],
  },
  characters: [
    {
      id: 'traveler',
      baseAttributes: { strength: 3, movement: 3 },
      startingResources: { health: 12, focus: 4 },
      startingAbilityIds: ['strike', 'lethal-mark'],
    },
    {
      id: 'guardian',
      baseAttributes: { strength: 2, movement: 2 },
      startingResources: { health: 10, focus: 4 },
      startingAbilityIds: ['enemy-strike'],
    },
  ],
  items: [{ id: 'leaf-token', stackLimit: 1, unique: true }],
  equipmentSlots: [],
  abilities: [
    {
      id: 'strike',
      resourceCosts: { focus: 1 },
      target: { kind: 'enemy', minimumRange: 1, maximumRange: 1 },
      effects: [{ op: 'damage', amount: 4 }],
    },
    {
      id: 'lethal-mark',
      resourceCosts: {},
      target: { kind: 'enemy', minimumRange: 1, maximumRange: 1 },
      effects: [{ op: 'damage', amount: 10 }],
    },
    {
      id: 'enemy-strike',
      resourceCosts: {},
      target: { kind: 'enemy', minimumRange: 1, maximumRange: 1 },
      effects: [{ op: 'damage', amount: 4 }],
    },
  ],
  statusEffects: [],
  boards: [{ id: 'courtyard-board', width: 5, height: 5, blockedCells: [] }],
  encounters: [
    {
      id: GUARDIAN_TRIAL_ENCOUNTER_ID,
      boardId: 'courtyard-board',
      maxTurns: 12,
      allowWithdrawal: true,
      participants: [
        {
          id: 'traveler-seat',
          characterId: 'traveler',
          team: 'player',
          position: { x: 0, y: 0 },
          initiative: 10,
        },
        {
          id: 'guardian-seat',
          characterId: 'guardian',
          team: 'enemy',
          position: { x: 1, y: 0 },
          initiative: 2,
        },
      ],
      victoryRewards: {
        experience: [{ characterId: 'traveler', amount: 5 }],
        items: [{ itemId: 'leaf-token', quantity: 1 }],
      },
      outcomeMappings: [
        { outcome: 'victory', consequenceId: 'trial-won' },
        { outcome: 'defeat', consequenceId: 'trial-lost' },
        { outcome: 'turn-limit', consequenceId: 'trial-timeout' },
        { outcome: 'withdrawn', consequenceId: 'trial-withdrew' },
      ],
    },
  ],
} as const satisfies GameplayDefinition;

export const bloodLeafGameplay = compileGameplay(bloodLeafGameplayDefinition);

export const bloodLeafGameplayCopy = {
  startTrial: 'آغاز آزمایش نگهبان',
  title: 'آزمایش نگهبان',
  yourTurn: 'نوبت توست',
  enemyTurn: 'نوبت نگهبان',
  wait: 'صبر کن',
  withdraw: 'کناره‌گیری',
  move: 'حرکت',
  strike: 'ضربه',
  lethal: 'نشان مرگبار',
  health: 'جان',
  victory: 'پیروزی',
  defeat: 'شکست',
  boardLabel: 'صفحهٔ نبرد',
} as const;
