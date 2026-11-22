import type { NarrativeDefinition } from 'waypoint-rpg-narrative';

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
          speakerId: 'gardener',
          text: { fa: 'به باغ قصه‌ها خوش آمدی.' },
          terminal: true,
          endingId: 'welcome',
        },
      ],
    },
  ],
  quests: [{ id: 'gardener' }],
};
