import { describe, expect, it } from 'vitest';
import {
  createNarrativeState,
  getDialogueView,
  transitionNarrative,
  type NarrativeState,
} from 'waypoint-rpg-narrative';
import { bloodLeafNarrative } from './content/blood-leaf.js';
import { decodeDemoSave, encodeDemoSave } from './persistence.js';
import phase3FixtureJson from '../fixtures/phase3-saves.json?raw';

const state = createNarrativeState(bloodLeafNarrative, 'blood-leaf-save-test');
const phase3FixtureManifest = JSON.parse(phase3FixtureJson) as {
  readonly generatedFrom: string;
  readonly fixtures: readonly {
    readonly id: string;
    readonly raw: string;
    readonly legacy: {
      readonly mapId: string;
      readonly entryAnchorId: string;
      readonly activeDialogue: { readonly dialogueId: string; readonly nodeId: string } | null;
      readonly suspendedDialogue: { readonly dialogueId: string; readonly nodeId: string } | null;
      readonly facts: Readonly<Record<string, unknown>>;
      readonly quests: Readonly<Record<string, string>>;
      readonly appliedChoiceIds: readonly string[];
      readonly appliedTriggerIds: readonly string[];
      readonly endingId: string | null;
      readonly permittedNext: readonly string[];
    };
  }[];
};

describe('scene-demo save envelope', () => {
  it('round-trips story and committed location while copy version changes remain compatible', () => {
    const raw = encodeDemoSave({
      contentVersion: 'copy-before',
      mapId: 'map-workshop',
      entryAnchorId: 'anchor-workshop-lamp',
      narrative: state,
    });
    const decoded = decodeDemoSave(raw);

    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.value.mapId).toBe('map-workshop');
    expect(decoded.value.entryAnchorId).toBe('anchor-workshop-lamp');
    expect(decoded.value.narrative).toEqual(state);
    expect(decoded.value.contentVersion).toBe('copy-before');
  });

  it('rejects unsupported envelopes and corrupt bytes with explicit classifications', () => {
    expect(decodeDemoSave('{')).toMatchObject({ ok: false, kind: 'corrupt' });
    const unsupported = JSON.stringify({ schemaVersion: 999 });
    expect(decodeDemoSave(unsupported)).toMatchObject({ ok: false, kind: 'unsupported' });
  });

  it('classifies incompatible story structure without treating copy version as structure', () => {
    const raw = encodeDemoSave({
      contentVersion: 'copy-before',
      mapId: 'map-courtyard',
      entryAnchorId: 'anchor-courtyard-start',
      narrative: state,
    });
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const incompatible = JSON.stringify({
      ...parsed,
      compatibilityVersion: 'different-story-structure',
    });

    expect(decodeDemoSave(raw).ok).toBe(true);
    expect(decodeDemoSave(incompatible)).toMatchObject({ ok: false, kind: 'incompatible' });
  });

  it('migrates every actual Phase 3 encoder fixture without changing progress identity', () => {
    expect(phase3FixtureManifest.generatedFrom).toContain('encodeDemoSave schemaVersion 1');
    expect(phase3FixtureManifest.fixtures).toHaveLength(26);

    for (const fixture of phase3FixtureManifest.fixtures) {
      const oldEnvelope = JSON.parse(fixture.raw) as {
        readonly schemaVersion: number;
        readonly narrative: NarrativeState;
      };
      expect(oldEnvelope.schemaVersion, fixture.id).toBe(1);
      expect(oldEnvelope.narrative.activeDialogue, fixture.id).toEqual(
        fixture.legacy.activeDialogue,
      );
      expect(oldEnvelope.narrative.suspendedDialogue, fixture.id).toEqual(
        fixture.legacy.suspendedDialogue,
      );

      const decoded = decodeDemoSave(fixture.raw);
      expect(decoded.ok, fixture.id).toBe(true);
      if (!decoded.ok) continue;
      const migrated = decoded.value.narrative;
      const old = oldEnvelope.narrative;
      expect(decoded.value.mapId, fixture.id).toBe(fixture.legacy.mapId);
      expect(decoded.value.entryAnchorId, fixture.id).toBe(fixture.legacy.entryAnchorId);
      expect(migrated.playthroughId, fixture.id).toBe(old.playthroughId);
      expect(migrated.revision, fixture.id).toBe(old.revision);
      expect(migrated.quests, fixture.id).toEqual(fixture.legacy.quests);
      expect(migrated.appliedChoiceIds, fixture.id).toEqual(fixture.legacy.appliedChoiceIds);
      expect(migrated.appliedTriggerIds, fixture.id).toEqual(fixture.legacy.appliedTriggerIds);
      for (const [key, value] of Object.entries(fixture.legacy.facts))
        expect(migrated.facts[key], `${fixture.id} fact ${key}`).toEqual(value);
      expect(migrated.facts['seeking-truth'], fixture.id).toBe(
        fixture.legacy.facts['seeking-truth'] ?? false,
      );
      expect(migrated.facts['seeking-vengeance'], fixture.id).toBe(
        fixture.legacy.facts['seeking-vengeance'] ?? false,
      );
      expect(migrated.facts['lantern-lit'], fixture.id).toBe(
        fixture.legacy.facts['lantern-lit'] ?? false,
      );

      const grandfatheredTruthEnding =
        fixture.legacy.endingId === 'ending-truth' ||
        fixture.legacy.activeDialogue?.nodeId === 'truth-ending' ||
        fixture.legacy.suspendedDialogue?.nodeId === 'truth-ending';
      expect(migrated.facts['clue-resolved'], fixture.id).toBe(grandfatheredTruthEnding);
      expect(migrated.endingId, fixture.id).toBe(fixture.legacy.endingId);

      const migratePointer = (
        pointer: typeof fixture.legacy.activeDialogue,
      ): typeof fixture.legacy.activeDialogue => {
        if (
          pointer?.dialogueId === 'guardian-dialogue' &&
          fixture.legacy.facts['seeking-truth'] === true &&
          ['truth-response', 'closing-question'].includes(pointer.nodeId)
        )
          return { dialogueId: pointer.dialogueId, nodeId: 'truth-awaiting-clue' };
        return pointer;
      };
      expect(migrated.activeDialogue, fixture.id).toEqual(
        migratePointer(fixture.legacy.activeDialogue),
      );
      expect(migrated.suspendedDialogue, fixture.id).toEqual(
        migratePointer(fixture.legacy.suspendedDialogue),
      );

      const commandAtCursor = (pointer: NonNullable<typeof migrated.activeDialogue>): string[] => {
        const view = getDialogueView(
          bloodLeafNarrative,
          { ...migrated, activeDialogue: pointer, suspendedDialogue: null },
          'fa-IR',
        );
        expect(view, fixture.id).not.toBeNull();
        if (view?.closeAllowed) return ['CLOSE_DIALOGUE'];
        if (view?.terminal) return ['FINISH'];
        if (view?.choices.length)
          return view.choices
            .filter((choice) => choice.available)
            .map((choice) => `CHOOSE ${choice.id}`);
        return ['ADVANCE'];
      };
      const expectedCommandsByNode: Record<string, readonly string[]> = {
        'guardian-question': ['CHOOSE seek-truth', 'CHOOSE seek-vengeance'],
        'truth-awaiting-clue': ['CLOSE_DIALOGUE'],
        'vengeance-response': ['ADVANCE'],
        'closing-question': ['CHOOSE end-with-anger'],
        'truth-ending': ['FINISH'],
        'vengeance-ending': ['FINISH'],
      };
      if (migrated.activeDialogue) {
        expect(commandAtCursor(migrated.activeDialogue), fixture.id).toEqual(
          expectedCommandsByNode[migrated.activeDialogue.nodeId],
        );
      } else if (migrated.suspendedDialogue) {
        const owner =
          migrated.suspendedDialogue.dialogueId === 'workshop-clue-dialogue'
            ? 'map-workshop'
            : 'map-courtyard';
        const handoff =
          fixture.legacy.mapId === owner
            ? `OPEN_DIALOGUE ${migrated.suspendedDialogue.dialogueId}`
            : `RETURN ${owner}; OPEN_DIALOGUE ${migrated.suspendedDialogue.dialogueId}`;
        expect(handoff, fixture.id).toBe(
          fixture.legacy.mapId === 'map-workshop'
            ? 'RETURN map-courtyard; OPEN_DIALOGUE guardian-dialogue'
            : 'OPEN_DIALOGUE guardian-dialogue',
        );
        expect(
          commandAtCursor(migrated.suspendedDialogue),
          `${fixture.id} after resuming ${handoff}`,
        ).toEqual(expectedCommandsByNode[migrated.suspendedDialogue.nodeId]);
      } else if (migrated.endingId === null) {
        expect(fixture.legacy.permittedNext, fixture.id).toEqual([
          'OPEN_DIALOGUE guardian-dialogue',
        ]);
      }

      // Decoding and re-encoding is a pure, idempotent v1→v2 migration; it never writes storage.
      const redecoded = decodeDemoSave(
        encodeDemoSave({
          contentVersion: decoded.value.contentVersion,
          mapId: decoded.value.mapId,
          entryAnchorId: decoded.value.entryAnchorId,
          narrative: migrated,
        }),
      );
      expect(redecoded.ok, fixture.id).toBe(true);
      if (redecoded.ok) expect(redecoded.value).toEqual(decoded.value);
    }
  });

  it('maps consumed truth-ending choices to a directly finishable terminal', () => {
    const fixture = phase3FixtureManifest.fixtures.find(
      (item) => item.id === 'truth-ending-active-courtyard',
    );
    expect(fixture).toBeDefined();
    if (!fixture) return;
    const decoded = decodeDemoSave(fixture.raw);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.value.narrative.appliedChoiceIds).toContain('end-with-truth');
    expect(getDialogueView(bloodLeafNarrative, decoded.value.narrative, 'fa-IR')?.terminal).toBe(
      true,
    );
    const result = transitionNarrative(bloodLeafNarrative, decoded.value.narrative, {
      type: 'finish',
      playthroughId: decoded.value.narrative.playthroughId,
      expectedRevision: decoded.value.narrative.revision,
    });
    expect(result.accepted).toBe(true);
    if (result.accepted) expect(result.state.endingId).toBe('ending-truth');
  });

  it('resumes a suspended legacy truth-ending directly to finish without replaying its consumed choice', () => {
    const fixture = phase3FixtureManifest.fixtures.find(
      (item) => item.id === 'truth-ending-suspended-workshop',
    );
    expect(fixture).toBeDefined();
    if (!fixture) return;
    const decoded = decodeDemoSave(fixture.raw);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    const state = decoded.value.narrative;
    expect(state.appliedChoiceIds).toContain('end-with-truth');
    const reopened = transitionNarrative(bloodLeafNarrative, state, {
      type: 'open-dialogue',
      dialogueId: 'guardian-dialogue',
      playthroughId: state.playthroughId,
      expectedRevision: state.revision,
    });
    expect(reopened.accepted).toBe(true);
    if (!reopened.accepted) return;
    expect(getDialogueView(bloodLeafNarrative, reopened.state, 'fa-IR')?.terminal).toBe(true);
    const finished = transitionNarrative(bloodLeafNarrative, reopened.state, {
      type: 'finish',
      playthroughId: reopened.state.playthroughId,
      expectedRevision: reopened.state.revision,
    });
    expect(finished.accepted).toBe(true);
    if (finished.accepted) expect(finished.state.endingId).toBe('ending-truth');
  });
});
