import assert from 'node:assert/strict';
import test from 'node:test';
import { compileNarrative, NarrativeDefinitionError, validateNarrative } from '../dist/index.js';

function definition() {
  return {
    schemaVersion: 1,
    id: 'story-test',
    contentVersion: 'copy-1',
    compatibilityVersion: 'structure-1',
    entryDialogueId: 'guardian',
    quests: [{ id: 'clue-quest', restartable: true }],
    dialogues: [
      {
        id: 'guardian',
        entryNodeId: 'question',
        exitPolicy: 'allowed',
        nodes: [
          {
            id: 'question',
            speakerId: 'guardian',
            text: { fa: 'چه می‌خواهی؟' },
            choices: [
              {
                id: 'choose-truth',
                label: { fa: 'دانستن حقیقت' },
                targetNodeId: 'truth-ending',
                effects: [
                  { op: 'start-quest', questId: 'clue-quest' },
                  { op: 'complete-quest', questId: 'clue-quest' },
                ],
              },
            ],
          },
          {
            id: 'truth-ending',
            speakerId: 'guardian',
            text: { fa: 'حقیقت روشن شد.' },
            terminal: true,
            endingId: 'ending-truth',
          },
        ],
      },
    ],
  };
}

const hasCode = (report, code) => report.diagnostics.some((item) => item.code === code);

test('accepts a valid localized story and ordered quest operations', () => {
  const report = validateNarrative(definition());
  assert.equal(report.ok, true, JSON.stringify(report.diagnostics));
  assert.equal(report.errorCount, 0);
});

test('reports duplicate IDs, invalid references, conditions, effects, and numeric operands precisely', () => {
  const value = definition();
  value.quests.push({ id: 'clue-quest' });
  value.dialogues[0].nodes[0].choices[0].targetNodeId = 'missing-node';
  value.dialogues[0].nodes[0].choices[0].when = { op: 'mystery' };
  value.dialogues[0].nodes[0].choices[0].effects.push(
    { op: 'not-an-effect' },
    { op: 'increment-fact', key: 'trust', amount: 0.5 },
  );
  const report = validateNarrative(value);
  assert.equal(hasCode(report, 'duplicate-quest-id'), true);
  assert.equal(hasCode(report, 'missing-node-target'), true);
  assert.equal(hasCode(report, 'unknown-condition-op'), true);
  assert.equal(hasCode(report, 'unknown-effect-op'), true);
  assert.equal(hasCode(report, 'effect-operand'), true);
  assert.ok(report.diagnostics.every((item) => item.path.startsWith('$')));
});

test('rejects authored references to derived quest availability states', () => {
  const value = definition();
  value.quests[0].prerequisites = {
    op: 'quest-status',
    questId: 'clue-quest',
    status: 'available',
  };
  const report = validateNarrative(value);
  assert.equal(hasCode(report, 'derived-quest-status'), true);
});

test('rejects direct and indirect unconditional active-prerequisite cycles', () => {
  const direct = definition();
  direct.quests = [
    { id: 'self', prerequisites: { op: 'quest-status', questId: 'self', status: 'active' } },
  ];
  assert.equal(hasCode(validateNarrative(direct), 'quest-prerequisite-cycle'), true);

  const indirect = definition();
  indirect.quests = [
    { id: 'first', prerequisites: { op: 'quest-status', questId: 'second', status: 'active' } },
    { id: 'second', prerequisites: { op: 'quest-status', questId: 'first', status: 'active' } },
  ];
  assert.equal(hasCode(validateNarrative(indirect), 'quest-prerequisite-cycle'), true);
});

test('rejects cycles through completed, failed, and cancelled quest statuses', () => {
  const selfCompleted = definition();
  selfCompleted.quests = [
    {
      id: 'self',
      prerequisites: { op: 'quest-status', questId: 'self', status: 'completed' },
    },
  ];
  assert.equal(hasCode(validateNarrative(selfCompleted), 'quest-prerequisite-cycle'), true);

  const completedCycle = definition();
  completedCycle.quests = [
    {
      id: 'first',
      prerequisites: { op: 'quest-status', questId: 'second', status: 'completed' },
    },
    {
      id: 'second',
      prerequisites: { op: 'quest-status', questId: 'first', status: 'completed' },
    },
  ];
  assert.equal(hasCode(validateNarrative(completedCycle), 'quest-prerequisite-cycle'), true);

  const mixedCycle = definition();
  mixedCycle.quests = [
    {
      id: 'first',
      prerequisites: { op: 'quest-status', questId: 'second', status: 'active' },
    },
    {
      id: 'second',
      prerequisites: { op: 'quest-status', questId: 'third', status: 'failed' },
    },
    {
      id: 'third',
      prerequisites: { op: 'quest-status', questId: 'first', status: 'cancelled' },
    },
  ];
  assert.equal(hasCode(validateNarrative(mixedCycle), 'quest-prerequisite-cycle'), true);
});

test('keeps a viable any alternative non-fatal and dependencies under not non-positive', () => {
  const alternative = definition();
  alternative.quests = [
    { id: 'clue-quest' },
    { id: 'independent-root' },
    {
      id: 'first',
      prerequisites: {
        op: 'any',
        conditions: [
          { op: 'quest-status', questId: 'second', status: 'completed' },
          { op: 'quest-status', questId: 'independent-root', status: 'active' },
        ],
      },
    },
    {
      id: 'second',
      prerequisites: { op: 'quest-status', questId: 'first', status: 'failed' },
    },
  ];
  const alternativeReport = validateNarrative(alternative);
  assert.equal(alternativeReport.ok, true, JSON.stringify(alternativeReport.diagnostics));
  assert.equal(hasCode(alternativeReport, 'quest-prerequisite-cycle'), false);
  assert.equal(hasCode(alternativeReport, 'conditional-quest-cycle'), true);

  const negated = definition();
  negated.quests = [
    { id: 'clue-quest' },
    {
      id: 'first',
      prerequisites: {
        op: 'not',
        condition: { op: 'quest-status', questId: 'second', status: 'completed' },
      },
    },
    {
      id: 'second',
      prerequisites: { op: 'quest-status', questId: 'first', status: 'cancelled' },
    },
  ];
  const negatedReport = validateNarrative(negated);
  assert.equal(negatedReport.ok, true, JSON.stringify(negatedReport.diagnostics));
  assert.equal(hasCode(negatedReport, 'quest-prerequisite-cycle'), false);
  assert.equal(hasCode(negatedReport, 'conditional-quest-cycle'), false);
});

test('warns when a prerequisite cycle depends on a condition that cannot be solved statically', () => {
  const value = definition();
  value.quests = [
    { id: 'clue-quest' },
    {
      id: 'first',
      prerequisites: {
        op: 'any',
        conditions: [
          { op: 'quest-status', questId: 'second', status: 'active' },
          { op: 'flag', key: 'clue_found', equals: true },
        ],
      },
    },
    { id: 'second', prerequisites: { op: 'quest-status', questId: 'first', status: 'active' } },
  ];
  const report = validateNarrative(value);
  assert.equal(report.ok, true, JSON.stringify(report.diagnostics));
  assert.equal(hasCode(report, 'conditional-quest-cycle'), true);
});

test('allows dialogue cycles and reports unreachable nodes as warnings', () => {
  const value = definition();
  value.dialogues[0].nodes.push(
    {
      id: 'loop-a',
      speakerId: 'guardian',
      text: { fa: 'دوباره بگو.' },
      nextNodeId: 'loop-b',
    },
    {
      id: 'loop-b',
      speakerId: 'guardian',
      text: { fa: 'باشه.' },
      nextNodeId: 'loop-a',
    },
  );
  const report = validateNarrative(value);
  assert.equal(report.ok, true, JSON.stringify(report.diagnostics));
  assert.equal(hasCode(report, 'unreachable-node'), true);
});

test('rejects non-JSON structures, cycles, accessors, and unsafe keys', () => {
  const cycle = definition();
  cycle.self = cycle;
  assert.equal(hasCode(validateNarrative(cycle), 'cyclic-json'), true);

  const accessor = definition();
  Object.defineProperty(accessor, 'hidden', { enumerable: true, get: () => 1 });
  assert.equal(hasCode(validateNarrative(accessor), 'unsafe-key'), true);

  const unsafe = definition();
  Object.defineProperty(unsafe, '__proto__', { enumerable: true, value: { polluted: true } });
  assert.equal(hasCode(validateNarrative(unsafe), 'unsafe-key'), true);

  const classValue = definition();
  classValue.extra = new Date();
  assert.equal(hasCode(validateNarrative(classValue), 'non-plain-object'), true);
});

test('returns diagnostics for malformed nested shapes without throwing', () => {
  const value = definition();
  value.quests[0].prerequisites = { op: 'all', conditions: 'not-an-array' };
  value.dialogues[0].nodes = [
    null,
    {
      id: 'bad-node',
      speakerId: 'guardian',
      text: { fa: 'متن' },
      choices: { id: 'bad-shape' },
    },
  ];
  value.triggers = [{ id: 'bad-trigger', effects: { op: 'set-flag' } }];
  const report = validateNarrative(value);
  assert.equal(report.ok, false);
  assert.ok(report.diagnostics.length > 0);
});

test('compiled content is a defensive deeply frozen copy with no exposed indexes', () => {
  const authored = definition();
  const compiled = compileNarrative(authored);
  authored.dialogues[0].nodes[0].text.fa = 'changed after compile';
  authored.dialogues[0].nodes[0].choices[0].label.fa = 'changed choice';
  assert.equal(compiled.definition.dialogues[0].nodes[0].text.fa, 'چه می‌خواهی؟');
  assert.equal(compiled.definition.dialogues[0].nodes[0].choices[0].label.fa, 'دانستن حقیقت');
  assert.notEqual(compiled.definition, authored);
  assert.equal(Object.isFrozen(compiled), true);
  assert.equal(Object.isFrozen(compiled.definition.dialogues[0].nodes[0].choices[0]), true);
  assert.equal(Object.hasOwn(compiled, 'indexes'), false);
  assert.throws(
    () => compileNarrative({ ...authored, schemaVersion: 9 }),
    NarrativeDefinitionError,
  );
});
