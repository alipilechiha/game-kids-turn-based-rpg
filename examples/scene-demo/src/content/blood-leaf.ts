import { compileNarrative, type NarrativeDefinition } from 'waypoint-rpg-narrative';

/** Original fictional copy for the independent narrative-engine demonstration. */
export const bloodLeafDefinition: NarrativeDefinition = {
  schemaVersion: 1,
  id: 'blood-leaf-demo',
  contentVersion: 'fa-copy-2',
  compatibilityVersion: 'blood-leaf-shape-2',
  defaultLocale: 'fa',
  facts: [
    { key: 'seeking-truth', type: 'boolean', default: false },
    { key: 'seeking-vengeance', type: 'boolean', default: false },
    { key: 'lantern-lit', type: 'boolean', default: false },
    { key: 'clue-resolved', type: 'boolean', default: false },
    { key: 'guardian-trial-complete', type: 'boolean', default: false },
    { key: 'guardian-trial-won', type: 'boolean', default: false },
  ],
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
              targetNodeId: 'truth-awaiting-clue',
              effects: [
                { op: 'set-flag', key: 'seeking-truth', value: true },
                { op: 'start-quest', questId: 'leaf-inquiry' },
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
          id: 'truth-awaiting-clue',
          speakerId: 'guardian',
          text: {
            fa: 'برای یافتن حقیقت، سرنخ برگ را در کارگاه بررسی کن.',
            en: 'To seek the truth, investigate the leaf’s clue in the workshop.',
          },
          closesDialogue: true,
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
          when: { op: 'flag', key: 'seeking-vengeance', equals: true },
          text: {
            fa: 'راه تندت را چگونه به پایان می‌رسانی؟',
            en: 'How will you end the path you chose?',
          },
          choices: [
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
          when: { op: 'flag', key: 'clue-resolved', equals: true },
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
          when: { op: 'flag', key: 'seeking-vengeance', equals: true },
          text: {
            fa: 'راه خشم پایان یافت، اما پرسش‌ها باقی ماندند.',
            en: 'The angry path ends, but the questions remain.',
          },
          terminal: true,
          endingId: 'ending-anger',
        },
      ],
    },
    {
      id: 'workshop-clue-dialogue',
      entryNodeId: 'clue-introduction',
      when: { op: 'flag', key: 'seeking-truth', equals: true },
      exitPolicy: 'allowed',
      nodes: [
        {
          id: 'clue-introduction',
          speakerId: 'guardian',
          text: {
            fa: 'روی برگ نشانی مانده است. با دقت نگاه کن.',
            en: 'A mark remains on the leaf. Look closely.',
          },
          nextNodeId: 'clue-question',
        },
        {
          id: 'clue-question',
          speakerId: 'guardian',
          text: {
            fa: 'آیا نشانه را بررسی می‌کنی؟',
            en: 'Will you investigate the clue?',
          },
          choices: [
            {
              id: 'investigate-clue',
              label: { fa: 'سرنخ را بررسی کن', en: 'Investigate the clue' },
              targetNodeId: 'clue-resolved',
              when: { op: 'quest-status', questId: 'leaf-inquiry', status: 'active' },
              effects: [
                { op: 'set-flag', key: 'lantern-lit', value: true },
                { op: 'set-flag', key: 'clue-resolved', value: true },
                { op: 'complete-quest', questId: 'leaf-inquiry' },
              ],
            },
            {
              id: 'investigate-legacy-clue',
              label: { fa: 'سرنخ را بررسی کن', en: 'Investigate the clue' },
              targetNodeId: 'clue-resolved',
              when: { op: 'quest-status', questId: 'leaf-inquiry', status: 'completed' },
              effects: [
                { op: 'set-flag', key: 'lantern-lit', value: true },
                { op: 'set-flag', key: 'clue-resolved', value: true },
              ],
            },
          ],
        },
        {
          id: 'clue-resolved',
          speakerId: 'guardian',
          text: {
            fa: 'نشانه روشن شد و پرس‌وجو کامل شد.',
            en: 'The mark is clear, and the inquiry is complete.',
          },
          closesDialogue: true,
        },
      ],
    },
    {
      id: 'truth-resolution-dialogue',
      entryNodeId: 'resolution-question',
      when: {
        op: 'all',
        conditions: [
          { op: 'flag', key: 'seeking-truth', equals: true },
          { op: 'flag', key: 'clue-resolved', equals: true },
          { op: 'quest-status', questId: 'leaf-inquiry', status: 'completed' },
        ],
      },
      exitPolicy: 'allowed',
      nodes: [
        {
          id: 'resolution-question',
          speakerId: 'guardian',
          text: {
            fa: 'اکنون که سرنخ را یافتی، پایان راه را برگزین.',
            en: 'Now that you found the clue, choose how the path will end.',
          },
          choices: [
            {
              id: 'end-with-truth',
              label: { fa: 'با روشنایی پایان بده', en: 'End with a light' },
              targetNodeId: 'truth-resolution-ending',
            },
          ],
        },
        {
          id: 'truth-resolution-ending',
          speakerId: 'guardian',
          text: {
            fa: 'چراغ روشن شد و راز برگ نگهداری شد.',
            en: 'The lantern shines, and the leaf’s secret is kept safe.',
          },
          terminal: true,
          endingId: 'ending-truth',
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
    {
      id: 'guardian-trial-won',
      when: {
        op: 'all',
        conditions: [
          { op: 'flag', key: 'seeking-vengeance', equals: true },
          { op: 'flag', key: 'guardian-trial-complete', equals: false },
        ],
      },
      effects: [
        { op: 'set-flag', key: 'guardian-trial-complete', value: true },
        { op: 'set-flag', key: 'guardian-trial-won', value: true },
      ],
    },
    {
      id: 'guardian-trial-lost',
      when: {
        op: 'all',
        conditions: [
          { op: 'flag', key: 'seeking-vengeance', equals: true },
          { op: 'flag', key: 'guardian-trial-complete', equals: false },
        ],
      },
      effects: [
        { op: 'set-flag', key: 'guardian-trial-complete', value: true },
        { op: 'set-flag', key: 'guardian-trial-won', value: false },
      ],
    },
  ],
};

export const bloodLeafNarrative = compileNarrative(bloodLeafDefinition);

export const bloodLeafCopy = {
  title: 'برگ خون',
  guardian: 'نگهبان',
  startDialogue: 'با نگهبان گفت‌وگو کن',
  resumeDialogue: 'گفت‌وگو را ادامه بده',
  truthResolution: 'پایان داستان',
  clueDialogue: 'بررسی سرنخ',
  clueWaiting: 'سرنخ هنوز بررسی نشده است',
  clueResolved: 'سرنخ بررسی شد',
  lanternLit: 'چراغ روشن است',
  startTrial: 'آغاز آزمایش نگهبان',
  trialComplete: 'آزمایش نگهبان پایان یافت',
  close: 'بستن گفت‌وگو',
  suspendedGuidance: {
    courtyard: 'گفت‌وگوی نگهبان ناتمام است. برای ادامه به حیاط برگرد.',
    workshop: 'گفت‌وگوی سرنخ ناتمام است. برای ادامه به کارگاه برگرد.',
  },
  choicesLabel: 'پاسخ‌ها',
  resetStory: 'آغاز داستان تازه',
  confirmReset: 'از آغاز داستان تازه مطمئنی؟ ذخیرهٔ قبلی پاک خواهد شد.',
  recoverStory: 'ادامه در نشست موقت',
  retrySavedScene: 'تلاش دوباره برای بازکردن جای ذخیره‌شده',
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
