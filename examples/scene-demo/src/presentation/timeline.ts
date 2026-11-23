import type { SemanticAction } from '../animation/contracts.js';

export type TimelineCue =
  | {
      readonly id: string;
      readonly atSeconds: number;
      readonly kind: 'camera';
      readonly position: readonly [number, number, number];
      readonly lookAt: readonly [number, number, number];
      readonly durationSeconds: number;
    }
  | {
      readonly id: string;
      readonly atSeconds: number;
      readonly kind: 'animation';
      readonly instanceId: string;
      readonly action: SemanticAction;
    }
  | {
      readonly id: string;
      readonly atSeconds: number;
      readonly kind: 'dialogue';
      readonly text: string;
      readonly locale?: string;
    }
  | {
      readonly id: string;
      readonly atSeconds: number;
      readonly kind: 'audio';
      readonly cueId: string;
    };

export interface TimelineDefinition {
  readonly id: string;
  readonly version: number;
  readonly durationSeconds: number;
  readonly cues: readonly TimelineCue[];
}

export interface CompiledTimeline {
  readonly id: string;
  readonly version: 1;
  readonly durationSeconds: number;
  readonly cues: readonly TimelineCue[];
}

export type TimelineStatus = 'idle' | 'playing' | 'paused' | 'completed' | 'cancelled';

export interface TimelineSnapshot {
  readonly status: TimelineStatus;
  readonly timeSeconds: number;
}

export interface TimelinePlayer {
  snapshot(): TimelineSnapshot;
  play(options?: { readonly reducedMotion?: boolean }): void;
  pause(): void;
  resume(): void;
  advance(deltaSeconds: number): readonly TimelineCue[];
  skip(): readonly TimelineCue[];
  cancel(): void;
}

function finiteVector(value: readonly number[]): value is readonly [number, number, number] {
  return value.length === 3 && value.every(Number.isFinite);
}

function validateCue(cue: TimelineCue, durationSeconds: number): void {
  if (!cue || typeof cue !== 'object' || typeof cue.id !== 'string' || cue.id.trim() === '')
    throw new Error('Timeline cue must have a non-empty stable ID.');
  if (!Number.isFinite(cue.atSeconds) || cue.atSeconds < 0 || cue.atSeconds > durationSeconds)
    throw new Error(`Timeline cue time is outside the timeline (${cue.id}).`);
  switch (cue.kind) {
    case 'camera':
      if (
        !finiteVector(cue.position) ||
        !finiteVector(cue.lookAt) ||
        !Number.isFinite(cue.durationSeconds) ||
        cue.durationSeconds < 0 ||
        cue.durationSeconds > 30
      )
        throw new Error(`Timeline camera cue is invalid (${cue.id}).`);
      break;
    case 'animation':
      if (
        typeof cue.instanceId !== 'string' ||
        cue.instanceId.trim() === '' ||
        !['idle', 'move', 'interact', 'combat', 'defeat'].includes(cue.action)
      )
        throw new Error(`Timeline animation cue has an invalid instance/action (${cue.id}).`);
      break;
    case 'dialogue':
      if (typeof cue.text !== 'string' || cue.text.trim() === '' || cue.text.length > 1000)
        throw new Error(`Timeline dialogue cue is invalid (${cue.id}).`);
      if (cue.locale !== undefined && (typeof cue.locale !== 'string' || cue.locale.trim() === ''))
        throw new Error(`Timeline dialogue locale is invalid (${cue.id}).`);
      break;
    case 'audio':
      if (typeof cue.cueId !== 'string' || cue.cueId.trim() === '')
        throw new Error(`Timeline audio cue is invalid (${cue.id}).`);
      break;
    default:
      throw new Error('Timeline cue kind is not supported.');
  }
}

export function compileTimeline(definition: TimelineDefinition): CompiledTimeline {
  if (
    !definition ||
    typeof definition.id !== 'string' ||
    definition.id.trim() === '' ||
    definition.version !== 1
  )
    throw new Error('Timeline definition has an invalid ID or unsupported version.');
  if (
    !Number.isFinite(definition.durationSeconds) ||
    definition.durationSeconds <= 0 ||
    definition.durationSeconds > 120
  )
    throw new Error('Timeline duration must be greater than zero and at most 120 seconds.');
  if (!Array.isArray(definition.cues) || definition.cues.length > 128)
    throw new Error('Timeline cues must be an array of at most 128 cues.');

  const cueIds = new Set<string>();
  const cues = definition.cues.map((cue, index) => {
    validateCue(cue, definition.durationSeconds);
    if (cueIds.has(cue.id)) throw new Error(`Timeline cue ID is duplicated (${cue.id}).`);
    cueIds.add(cue.id);
    return { cue: structuredClone(cue), index };
  });
  cues.sort((left, right) => left.cue.atSeconds - right.cue.atSeconds || left.index - right.index);
  const frozenCues = Object.freeze(
    cues.map(({ cue }) => {
      if (cue.kind === 'camera') {
        return Object.freeze({
          ...cue,
          position: Object.freeze([...cue.position]) as readonly [number, number, number],
          lookAt: Object.freeze([...cue.lookAt]) as readonly [number, number, number],
        });
      }
      return Object.freeze(cue);
    }),
  );
  return Object.freeze({
    id: definition.id,
    version: 1,
    durationSeconds: definition.durationSeconds,
    cues: frozenCues,
  });
}

export function createTimelinePlayer(timeline: CompiledTimeline): TimelinePlayer {
  let status: TimelineStatus = 'idle';
  let timeSeconds = 0;
  let nextCueIndex = 0;
  let reducedMotion = false;

  const snapshot = (): TimelineSnapshot => Object.freeze({ status, timeSeconds });
  const takeCuesThrough = (time: number): readonly TimelineCue[] => {
    const startedAt = nextCueIndex;
    while (nextCueIndex < timeline.cues.length && timeline.cues[nextCueIndex]!.atSeconds <= time)
      nextCueIndex += 1;
    return timeline.cues.slice(startedAt, nextCueIndex);
  };

  return {
    snapshot,
    play(options = {}) {
      if (status === 'playing') return;
      status = 'playing';
      timeSeconds = 0;
      nextCueIndex = 0;
      reducedMotion = options.reducedMotion ?? false;
    },
    pause() {
      if (status === 'playing') status = 'paused';
    },
    resume() {
      if (status === 'paused') status = 'playing';
    },
    advance(deltaSeconds) {
      if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0)
        throw new RangeError('Timeline delta must be finite and non-negative.');
      if (status !== 'playing') return [];
      timeSeconds = reducedMotion
        ? timeline.durationSeconds
        : Math.min(timeline.durationSeconds, timeSeconds + deltaSeconds);
      const cues = takeCuesThrough(timeSeconds);
      if (timeSeconds >= timeline.durationSeconds) status = 'completed';
      return cues;
    },
    skip() {
      if (status !== 'playing' && status !== 'paused') return [];
      timeSeconds = timeline.durationSeconds;
      status = 'completed';
      return takeCuesThrough(timeSeconds);
    },
    cancel() {
      if (status === 'playing' || status === 'paused') status = 'cancelled';
    },
  };
}
