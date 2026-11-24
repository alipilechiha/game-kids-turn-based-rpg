import { describe, expect, it } from 'vitest';
import { compileTimeline, createTimelinePlayer } from './timeline.js';

const definition = {
  id: 'guardian-intro',
  version: 1,
  durationSeconds: 2,
  cues: [
    {
      id: 'look',
      atSeconds: 0,
      kind: 'camera',
      position: [0, 3, 5],
      lookAt: [0, 1, 0],
      durationSeconds: 1,
    },
    { id: 'greet', atSeconds: 0.25, kind: 'animation', instanceId: 'guardian', action: 'interact' },
    { id: 'line', atSeconds: 0.5, kind: 'dialogue', text: 'سلام، رهگذر.' },
    { id: 'tone', atSeconds: 1, kind: 'audio', cueId: 'gentle-chime' },
  ],
} as const;

describe('cinematic timeline', () => {
  it('plays authored cues once in stable time order and can pause/resume', () => {
    const timeline = compileTimeline(definition);
    const player = createTimelinePlayer(timeline);
    player.play();

    expect(player.advance(0.3).map((cue) => cue.id)).toEqual(['look', 'greet']);
    player.pause();
    expect(player.advance(0.8)).toEqual([]);
    player.resume();
    expect(player.advance(0.3).map((cue) => cue.id)).toEqual(['line']);
    expect(player.advance(2).map((cue) => cue.id)).toEqual(['tone']);
    expect(player.snapshot()).toMatchObject({ status: 'completed', timeSeconds: 2 });
    expect(player.advance(1)).toEqual([]);
  });

  it('cancels without firing later cues and can be replayed', () => {
    const player = createTimelinePlayer(compileTimeline(definition));
    player.play();
    expect(player.advance(0.3).map((cue) => cue.id)).toEqual(['look', 'greet']);
    player.cancel();
    expect(player.advance(2)).toEqual([]);
    expect(player.snapshot().status).toBe('cancelled');
    player.play();
    expect(player.advance(0).map((cue) => cue.id)).toEqual(['look']);
  });

  it('skip fires each remaining cue once and reduced motion completes on the next tick', () => {
    const player = createTimelinePlayer(compileTimeline(definition));
    player.play();
    player.advance(0.3);
    expect(player.skip().map((cue) => cue.id)).toEqual(['line', 'tone']);
    expect(player.snapshot().status).toBe('completed');

    const reduced = createTimelinePlayer(compileTimeline(definition));
    reduced.play({ reducedMotion: true });
    expect(reduced.advance(1 / 60).map((cue) => cue.id)).toEqual(['look', 'greet', 'line', 'tone']);
    expect(reduced.snapshot().status).toBe('completed');
  });

  it('rejects malformed cue times, references, and camera values before playback', () => {
    expect(() =>
      compileTimeline({ ...definition, cues: [{ ...definition.cues[0], atSeconds: 3 }] }),
    ).toThrow(/cue time/i);
    expect(() =>
      compileTimeline({
        ...definition,
        cues: [{ ...definition.cues[1], instanceId: '' }],
      }),
    ).toThrow(/instance/i);
    expect(() =>
      compileTimeline({
        ...definition,
        cues: [{ ...definition.cues[0], position: [Number.NaN, 0, 0] }],
      }),
    ).toThrow(/camera/i);
  });

  it('does not mutate authored definitions or expose the compiled cue collection', () => {
    const authored = structuredClone(definition);
    const compiled = compileTimeline(authored);
    const player = createTimelinePlayer(compiled);
    player.play();
    player.advance(0.3);
    expect(authored).toEqual(definition);
    expect(Object.isFrozen(compiled)).toBe(true);
    expect(Object.isFrozen(compiled.cues)).toBe(true);
  });
});
