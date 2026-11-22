#!/usr/bin/env node
// Called only after Playwright has rendered the actual Kids RPG application.
// The README summary is separate from the generated framework roadmap.
import { readFileSync, statSync, writeFileSync } from 'node:fs';

const readmePath = 'README.md';
const folder = 'docs/previews/legacy-sample';
const start = '<!-- legacy-sample-previews:begin -->';
const end = '<!-- legacy-sample-previews:end -->';
const tick = String.fromCharCode(96);
const images = [
  '01-title.png',
  '02-avatar-select.png',
  '03-headwear-select.png',
  '04-town-hub.png',
  '05-town-portrait.png',
  '06-guardian-dialogue.png',
  '07-encounter-choice.png',
];

for (const file of images) {
  const size = statSync(folder + '/' + file).size;
  if (size <= 5_000) {
    throw new Error('Missing or empty real screenshot: ' + file);
  }
}

// Keep the authored Markdown gallery stable between captures.
// prettier-ignore
const section = [
  start,
  '',
  '## Reference game — محله مهربانی',
  '',
  '**Real Chromium/Playwright captures from the source-built Kids RPG.** ' +
    'The game currently uses ' + tick + 'waypoint-rpg-core' + tick +
    ' for runtime/navigation; its child-specific quests, dialogue, battle and ' +
    'renderer remain game-owned. See [the adoption matrix](docs/MAHALLE-LIBRARY-ADOPTION.md).',
  '',
  '> **Development previews only.** The game still contains draft educational ' +
    'content requiring review; these screenshots do not indicate content approval.',
  '',
  '| Town hub · landscape | Town hub · portrait |',
  '| --- | --- |',
  '| ![Actual Kids RPG town hub in landscape](' + folder + '/04-town-hub.png) | ' +
    '![Actual Kids RPG town hub in portrait](' + folder + '/05-town-portrait.png) |',
  '',
  '| NPC dialogue | Encounter choice |',
  '| --- | --- |',
  '| ![Actual Persian NPC dialogue](' + folder + '/06-guardian-dialogue.png) | ' +
    '![Actual physical choice encounter](' + folder + '/07-encounter-choice.png) |',
  '',
  'Additional captures: [title](' + folder + '/01-title.png), ' +
    '[avatar selection](' + folder + '/02-avatar-select.png), ' +
    '[headwear](' + folder + '/03-headwear-select.png).',
  '',
  '_Captures are generated on each merge and proposed for review; ' +
    'they are not AI-generated target concepts._',
  '',
  end,
].join('\n');

const original = readFileSync(readmePath, 'utf8');
const before = original.indexOf(start);
const after = original.indexOf(end);
let updated;
if (before >= 0 || after >= 0) {
  if (before < 0 || after < before) {
    throw new Error('Invalid sample gallery markers');
  }
  updated = original.slice(0, before) + section + original.slice(after + end.length);
} else {
  const anchor = '<!-- framework-roadmap:end -->';
  const offset = original.indexOf(anchor);
  if (offset < 0) throw new Error('Missing framework roadmap insertion point');
  const position = offset + anchor.length;
  updated = original.slice(0, position) + '\n\n' + section + original.slice(position);
}
if (updated !== original) {
  writeFileSync(readmePath, updated, 'utf8');
  console.log('Updated actual-source Kids RPG sample gallery.');
} else {
  console.log('Sample gallery already up to date.');
}
