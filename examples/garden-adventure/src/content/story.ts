import type { NarrativeDefinition } from 'waypoint-rpg-narrative';

/** All Garden of Stories characters, quests, dialogue, and outcomes live in this sample. */
export const gardenNarrativeDefinition: NarrativeDefinition = {
  schemaVersion: 1,
  id: 'garden-adventure',
  contentVersion: '1.0.0',
  compatibilityVersion: 'garden-story-v1',
  entryDialogueId: 'village-story',
  dialogues: [
    {
      id: 'village-story',
      entryNodeId: 'welcome',
      exitPolicy: 'allowed',
      nodes: [
        {
          id: 'welcome',
          speakerId: 'village-guide',
          text: { fa: 'چراغ باغ خاموش شده است. از چه کسی کمک می‌خواهی؟' },
          choices: [
            {
              id: 'listen-gardener',
              label: { fa: 'گفت‌وگو با باغبان' },
              targetNodeId: 'gardener-offer',
            },
            {
              id: 'meet-traveler',
              label: { fa: 'پرسیدن از مسافر' },
              targetNodeId: 'traveler-offer',
            },
          ],
        },
        {
          id: 'gardener-offer',
          speakerId: 'gardener',
          text: { fa: 'یک دانه ویژه دارم. کمک می‌کنی آن را بکاریم؟' },
          choices: [
            {
              id: 'help-gardener',
              label: { fa: 'کمک به کاشت دانه' },
              targetNodeId: 'gardener-wait',
              effects: [
                { op: 'set-fact', key: 'story-path', value: 'gardener' },
                { op: 'start-quest', questId: 'gardener-quest' },
              ],
            },
            {
              id: 'return-to-welcome-gardener',
              label: { fa: 'شنیدن راه دیگر' },
              targetNodeId: 'welcome',
            },
          ],
        },
        {
          id: 'traveler-offer',
          speakerId: 'traveler',
          text: { fa: 'نشانی روی سنگ پنهان است. با آن فانوس کهن را روشن می‌کنیم.' },
          choices: [
            {
              id: 'follow-light',
              label: { fa: 'جست‌وجوی نشانه و فانوس' },
              targetNodeId: 'traveler-wait',
              effects: [
                { op: 'set-fact', key: 'story-path', value: 'lantern' },
                { op: 'start-quest', questId: 'lantern-quest' },
              ],
            },
            {
              id: 'return-to-welcome-traveler',
              label: { fa: 'شنیدن راه دیگر' },
              targetNodeId: 'welcome',
            },
          ],
        },
        {
          id: 'gardener-wait',
          speakerId: 'gardener',
          text: { fa: 'دانه را از سبد بردار و در بستر باغ بکار.' },
          nextNodeId: 'garden-ending',
        },
        {
          id: 'traveler-wait',
          speakerId: 'traveler',
          text: { fa: 'نشان را پیدا کن و به فانوس کهن برسان.' },
          nextNodeId: 'lantern-ending',
        },
        {
          id: 'garden-ending',
          speakerId: 'gardener',
          text: { fa: 'دانه جوانه زد و باغ دوباره سبز شد. با هم از آن نگهداری می‌کنیم.' },
          when: { op: 'quest-status', questId: 'gardener-quest', status: 'completed' },
          terminal: true,
          endingId: 'ending-garden',
        },
        {
          id: 'lantern-ending',
          speakerId: 'traveler',
          text: { fa: 'فانوس روشن شد و نورش به همه باغ رسید.' },
          when: { op: 'quest-status', questId: 'lantern-quest', status: 'completed' },
          terminal: true,
          endingId: 'ending-lantern',
        },
      ],
    },
  ],
  quests: [
    {
      id: 'gardener-quest',
      prerequisites: { op: 'eq', key: 'story-path', value: 'gardener' },
    },
    {
      id: 'lantern-quest',
      prerequisites: { op: 'eq', key: 'story-path', value: 'lantern' },
    },
  ],
  triggers: [
    {
      id: 'find-garden-seed',
      when: {
        op: 'all',
        conditions: [
          { op: 'eq', key: 'story-path', value: 'gardener' },
          { op: 'quest-status', questId: 'gardener-quest', status: 'active' },
        ],
      },
      effects: [{ op: 'set-flag', key: 'seed-found', value: true }],
    },
    {
      id: 'plant-garden-seed',
      when: {
        op: 'all',
        conditions: [
          { op: 'eq', key: 'story-path', value: 'gardener' },
          { op: 'flag', key: 'seed-found', equals: true },
          { op: 'quest-status', questId: 'gardener-quest', status: 'active' },
        ],
      },
      effects: [
        { op: 'set-flag', key: 'tree-grown', value: true },
        { op: 'set-fact', key: 'garden-outcome', value: 'tree' },
        { op: 'complete-quest', questId: 'gardener-quest' },
      ],
    },
    {
      id: 'find-lantern-clue',
      when: {
        op: 'all',
        conditions: [
          { op: 'eq', key: 'story-path', value: 'lantern' },
          { op: 'quest-status', questId: 'lantern-quest', status: 'active' },
        ],
      },
      effects: [{ op: 'set-flag', key: 'clue-found', value: true }],
    },
    {
      id: 'light-ancient-lantern',
      when: {
        op: 'all',
        conditions: [
          { op: 'eq', key: 'story-path', value: 'lantern' },
          { op: 'flag', key: 'clue-found', equals: true },
          { op: 'quest-status', questId: 'lantern-quest', status: 'active' },
        ],
      },
      effects: [
        { op: 'set-flag', key: 'lantern-lit', value: true },
        { op: 'set-fact', key: 'garden-outcome', value: 'lantern' },
        { op: 'complete-quest', questId: 'lantern-quest' },
      ],
    },
  ],
};
