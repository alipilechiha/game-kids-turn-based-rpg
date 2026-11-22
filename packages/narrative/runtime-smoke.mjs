import assert from 'node:assert/strict';
import { log } from 'node:console';
import {
  compileNarrative,
  createNarrativeState,
  transitionNarrative,
} from 'waypoint-rpg-narrative';

const definition = compileNarrative({
  schemaVersion: 1,
  id: 'minimum-node-story',
  contentVersion: 'copy-1',
  compatibilityVersion: 'shape-1',
  defaultLocale: 'fa',
  facts: [{ key: 'clue-found', type: 'boolean', default: false }],
  entryDialogueId: 'intro',
  quests: [],
  dialogues: [
    {
      id: 'intro',
      entryNodeId: 'question',
      exitPolicy: 'forbidden',
      nodes: [
        {
          id: 'question',
          speakerId: 'guide',
          text: { fa: 'سرنخ را پیدا کردی؟' },
          choices: [
            {
              id: 'find-clue',
              label: { fa: 'بله' },
              targetNodeId: 'ending',
              effects: [{ op: 'set-flag', key: 'clue-found', value: true }],
            },
          ],
        },
        {
          id: 'ending',
          speakerId: 'guide',
          text: { fa: 'پایان' },
          terminal: true,
          endingId: 'story-complete',
        },
      ],
    },
  ],
});

const initial = createNarrativeState(definition, 'node-22-minimum-probe');
const opened = transitionNarrative(definition, initial, {
  type: 'open-dialogue',
  dialogueId: 'intro',
  playthroughId: initial.playthroughId,
  expectedRevision: initial.revision,
});
assert.equal(opened.accepted, true);
const chosen = transitionNarrative(definition, opened.state, {
  type: 'choose',
  choiceId: 'find-clue',
  playthroughId: initial.playthroughId,
  expectedRevision: opened.state.revision,
});
assert.equal(chosen.accepted, true);
assert.equal(chosen.state.facts['clue-found'], true);
const finished = transitionNarrative(definition, chosen.state, {
  type: 'finish',
  playthroughId: initial.playthroughId,
  expectedRevision: chosen.state.revision,
});
assert.equal(finished.accepted, true);
assert.equal(finished.state.endingId, 'story-complete');

log('narrative package native ESM runtime passed');
