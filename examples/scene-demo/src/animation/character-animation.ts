import { AnimationMixer, LoopOnce } from 'three';
import type { AnimationAction, AnimationClip, Object3D } from 'three';
import { resolveSemanticClip } from './contracts.js';
import type { ModelAssetRecord, SemanticAction } from './contracts.js';

export interface CharacterAnimationOptions {
  readonly crossFadeSeconds?: number;
  readonly invalidate?: () => void;
}

export interface CharacterAnimationController {
  /** Start a registered semantic clip as a bounded one-shot action. */
  setAction(action: SemanticAction, options?: { readonly reducedMotion?: boolean }): void;
  /** Advance only a currently active action; returns whether another frame is needed. */
  advance(deltaSeconds: number): boolean;
  dispose(): void;
}

const DEFAULT_CROSS_FADE_SECONDS = 0.12;

export function createCharacterAnimationController(
  root: Object3D,
  clips: readonly AnimationClip[],
  record: Pick<ModelAssetRecord, 'clips' | 'fallbackAction'>,
  options: CharacterAnimationOptions = {},
): CharacterAnimationController {
  const mixer = new AnimationMixer(root);
  const clipsByName = new Map(clips.map((clip) => [clip.name, clip]));
  const crossFadeSeconds = options.crossFadeSeconds ?? DEFAULT_CROSS_FADE_SECONDS;
  if (!Number.isFinite(crossFadeSeconds) || crossFadeSeconds < 0 || crossFadeSeconds > 2)
    throw new RangeError('Animation crossfade must be between zero and two seconds.');
  const invalidate = options.invalidate ?? (() => {});
  let current: AnimationAction | null = null;
  let active = false;
  let disposed = false;

  const onFinished = (event: { readonly action: AnimationAction }) => {
    if (event.action !== current) return;
    active = false;
    invalidate();
  };
  mixer.addEventListener('finished', onFinished);

  return {
    setAction(semanticAction, { reducedMotion = false } = {}) {
      if (disposed) return;
      const clipName = resolveSemanticClip(record, semanticAction);
      const clip = clipName ? clipsByName.get(clipName) : undefined;
      if (!clip) {
        current?.stop();
        current = null;
        active = false;
        invalidate();
        return;
      }

      const previous = current;
      const next = mixer.clipAction(clip, root);
      next.enabled = true;
      next.clampWhenFinished = true;
      next.setLoop(LoopOnce, 1);
      next.reset().play();
      if (previous && previous !== next) {
        if (active && crossFadeSeconds > 0) previous.crossFadeTo(next, crossFadeSeconds, false);
        else previous.stop();
      }
      current = next;
      active = !reducedMotion;

      if (reducedMotion) {
        next.time = clip.duration;
        mixer.update(0);
        next.paused = true;
      }
      invalidate();
    },
    advance(deltaSeconds) {
      if (disposed || !active) return false;
      if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0)
        throw new RangeError('Animation delta must be a finite non-negative number.');
      mixer.update(deltaSeconds);
      if (active) invalidate();
      return active;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      active = false;
      mixer.removeEventListener('finished', onFinished);
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
      current = null;
    },
  };
}
