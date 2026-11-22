import { compileNarrative, type NarrativeDefinition } from 'waypoint-rpg-narrative';

/** Original fictional copy for the independent narrative-engine demonstration. */
export const bloodLeafDefinition: NarrativeDefinition = {
  schemaVersion: 1,
  id: 'blood-leaf-demo',
  contentVersion: 'fa-copy-1',
  compatibilityVersion: 'blood-leaf-shape-1',
  entryDialogueId: 'guardian-dialogue',
  quests: [{ id: 'leaf-inquiry' }],
  dialogues: [
    {
      id: 'guardian-dialogue',
      entryNodeId: 'guardian-question',
      exitPolicy: 'allowed',
      nodes: [
        {
          id: 'guardian-question',
          speakerId: 'guardian',
          text: {
            fa: 'نگهبان به برگ نگاه کرد. چه می‌جویی؟',
            en: 'The guardian looks at the leaf. What do you seek?',
          },
          choices: [
            {
              id: 'seek-truth',
              label: { fa: 'حقیقت را می‌جویم', en: 'I seek the truth' },
              targetNodeId: 'truth-response',
              effects: [
                { op: 'set-flag', key: 'seeking-truth', value: true },
                { op: 'start-quest', questId: 'leaf-inquiry' },
                { op: 'complete-quest', questId: 'leaf-inquiry' },
              ],
            },
            {
              id: 'seek-vengeance',
              label: { fa: 'پاسخ تند می‌خواهم', en: 'I want a harsh answer' },
              targetNodeId: 'vengeance-response',
              effects: [
                { op: 'set-flag', key: 'seeking-vengeance', value: true },
                { op: 'start-quest', questId: 'leaf-inquiry' },
                { op: 'fail-quest', questId: 'leaf-inquiry' },
              ],
            },
          ],
        },
        {
          id: 'truth-response',
          speakerId: 'guardian',
          text: {
            fa: 'ردّ برگ را دنبال کردی و راز آن را یافتی.',
            en: 'You followed the leaf’s mark and found its secret.',
          },
          nextNodeId: 'closing-question',
        },
        {
          id: 'vengeance-response',
          speakerId: 'guardian',
          text: {
            fa: 'راه تندی را برگزیدی. نگهبان آرام پاسخ می‌دهد.',
            en: 'You chose a harsh path. The guardian answers calmly.',
          },
          nextNodeId: 'closing-question',
        },
        {
          id: 'closing-question',
          speakerId: 'guardian',
          text: {
            fa: 'اکنون پایان راه خود را برگزین.',
            en: 'Now choose how your path will end.',
          },
          choices: [
            {
              id: 'end-with-truth',
              label: { fa: 'با روشنایی پایان بده', en: 'End with a light' },
              targetNodeId: 'truth-ending',
              when: { op: 'flag', key: 'seeking-truth', equals: true },
            },
            {
              id: 'end-with-anger',
              label: { fa: 'با خشم پایان بده', en: 'End with anger' },
              targetNodeId: 'vengeance-ending',
              when: { op: 'flag', key: 'seeking-vengeance', equals: true },
            },
          ],
        },
        {
          id: 'truth-ending',
          speakerId: 'guardian',
          text: {
            fa: 'چراغ روشن شد و راز برگ نگهداری شد.',
            en: 'The lantern shines, and the leaf’s secret is kept safe.',
          },
          terminal: true,
          endingId: 'ending-truth',
        },
        {
          id: 'vengeance-ending',
          speakerId: 'guardian',
          text: {
            fa: 'راه خشم پایان یافت، اما پرسش‌ها باقی ماندند.',
            en: 'The angry path ends, but the questions remain.',
          },
          terminal: true,
          endingId: 'ending-anger',
        },
      ],
    },
  ],
  triggers: [
    {
      id: 'light-workshop-lantern',
      when: { op: 'flag', key: 'seeking-truth', equals: true },
      effects: [{ op: 'set-flag', key: 'lantern-lit', value: true }],
    },
  ],
};

export const bloodLeafNarrative = compileNarrative(bloodLeafDefinition);

export const bloodLeafCopy = {
  title: 'برگ خون',
  guardian: 'نگهبان',
  startDialogue: 'با نگهبان گفت‌وگو کن',
  resumeDialogue: 'گفت‌وگو را ادامه بده',
  choicesLabel: 'پاسخ‌ها',
  resetStory: 'آغاز داستان تازه',
  confirmReset: 'از آغاز داستان تازه مطمئنی؟ ذخیرهٔ قبلی پاک خواهد شد.',
  recoverStory: 'ادامه در نشست موقت',
  recoveryExplanation: 'ذخیرهٔ قبلی دست‌نخورده می‌ماند و داستان تازه موقت خواهد بود.',
  sessionOnly: 'این نشست ذخیره نمی‌شود',
  inquiryQuest: 'پرس‌وجوی برگ',
  questStatus: {
    active: 'در جریان',
    completed: 'پایان‌یافته',
    failed: 'ناتمام',
    cancelled: 'لغوشده',
    available: 'آماده',
    locked: 'بسته',
  },
  continue: 'ادامه',
  finish: 'پایان',
  leave: 'فعلاً می‌روم',
  endings: {
    'ending-truth': 'پایان روشنایی',
    'ending-anger': 'پایان خشم',
  },
} as const;
