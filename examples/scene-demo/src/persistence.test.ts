import { describe, expect, it } from 'vitest';
import { createNarrativeState } from 'waypoint-rpg-narrative';
import { bloodLeafNarrative } from './content/blood-leaf.js';
import { decodeDemoSave, encodeDemoSave } from './persistence.js';

const state = createNarrativeState(bloodLeafNarrative, 'blood-leaf-save-test');

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
});
