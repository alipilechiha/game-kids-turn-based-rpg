import { compileTimeline } from './timeline.js';

/** Original fictional presentation content for the independent scene consumer. */
export const guardianGreetingCinematic = compileTimeline({
  id: 'blood-leaf-guardian-greeting',
  version: 1,
  durationSeconds: 2.4,
  cues: [
    {
      id: 'stage-the-guardian',
      atSeconds: 0,
      kind: 'camera',
      position: [0, 3.15, 6.1],
      lookAt: [0, 0.85, 0],
      durationSeconds: 1.1,
    },
    {
      id: 'guardian-greeting',
      atSeconds: 0.25,
      kind: 'animation',
      instanceId: 'guardian',
      action: 'interact',
    },
    {
      id: 'guardian-dialogue',
      atSeconds: 0.55,
      kind: 'dialogue',
      locale: 'fa-IR',
      text: 'نگهبان آرام سر تکان می‌دهد؛ راه دانستن، از پرسیدن می‌گذرد.',
    },
  ],
});
