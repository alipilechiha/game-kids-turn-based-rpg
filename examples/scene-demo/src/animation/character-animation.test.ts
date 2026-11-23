import { AnimationClip, Bone, Group, VectorKeyframeTrack } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createCharacterAnimationController } from './character-animation.js';
import type { ModelAssetRecord, SemanticAction } from './contracts.js';

const assetRecord = {
  clips: {
    idle: 'Idle',
    move: 'Move',
    interact: 'Interact',
    combat: 'Combat',
  },
  fallbackAction: 'idle',
} as Pick<ModelAssetRecord, 'clips' | 'fallbackAction'>;

function character() {
  const root = new Group();
  const joint = new Bone();
  joint.name = 'Character root joint';
  root.add(joint);
  return { root, joint };
}

function clips(): AnimationClip[] {
  return [
    new AnimationClip('Idle', 1, [
      new VectorKeyframeTrack('Character root joint.position', [0, 1], [0, 0, 0, 0, 0, 0]),
    ]),
    new AnimationClip('Move', 1, [
      new VectorKeyframeTrack('Character root joint.position', [0, 1], [0, 0, 0, 1, 0, 0]),
    ]),
    new AnimationClip('Interact', 1, [
      new VectorKeyframeTrack('Character root joint.position', [0, 1], [0, 0, 0, 0, 1, 0]),
    ]),
    new AnimationClip('Combat', 1, [
      new VectorKeyframeTrack('Character root joint.position', [0, 1], [0, 0, 0, 0, 0, 1]),
    ]),
  ];
}

describe('character animation controller', () => {
  it('advances two character instances on independent mixer clocks', () => {
    const first = character();
    const second = character();
    const a = createCharacterAnimationController(first.root, clips(), assetRecord);
    const b = createCharacterAnimationController(second.root, clips(), assetRecord);

    a.setAction('move');
    b.setAction('interact');
    expect(a.advance(0.25)).toBe(true);
    expect(first.joint.position.x).toBeCloseTo(0.25, 2);
    expect(second.joint.position.y).toBe(0);

    expect(b.advance(0.1)).toBe(true);
    expect(second.joint.position.y).toBeCloseTo(0.1, 2);
    expect(first.joint.position.y).toBe(0);

    a.dispose();
    b.dispose();
  });

  it('interrupts a running action with a new semantic action', () => {
    const actor = character();
    const controller = createCharacterAnimationController(actor.root, clips(), assetRecord, {
      crossFadeSeconds: 0,
    });

    controller.setAction('move');
    controller.advance(0.2);
    expect(actor.joint.position.x).toBeCloseTo(0.2, 2);

    controller.setAction('combat');
    controller.advance(0.2);
    expect(actor.joint.position.z).toBeCloseTo(0.2, 2);
    expect(controller.advance(1.1)).toBe(false);
    controller.dispose();
  });

  it('uses the registered idle fallback for missing actions', () => {
    const actor = character();
    const controller = createCharacterAnimationController(actor.root, clips(), assetRecord, {
      crossFadeSeconds: 0,
    });

    controller.setAction('defeat');
    controller.advance(0.15);
    expect(actor.joint.position.toArray()).toEqual([0, 0, 0]);

    controller.dispose();
  });

  it('applies reduced-motion poses immediately without scheduling mixer frames', () => {
    const actor = character();
    const invalidate = vi.fn();
    const controller = createCharacterAnimationController(actor.root, clips(), assetRecord, {
      crossFadeSeconds: 0.2,
      invalidate,
    });

    controller.setAction('move', { reducedMotion: true });
    expect(actor.joint.position.x).toBe(1);
    expect(controller.advance(0.5)).toBe(false);
    expect(invalidate).toHaveBeenCalledTimes(1);

    controller.dispose();
  });

  it('settles one-shot clips, skips unknown mappings, and disposes idempotently', () => {
    const actor = character();
    const invalidate = vi.fn();
    const controller = createCharacterAnimationController(actor.root, clips(), assetRecord, {
      crossFadeSeconds: 0,
      invalidate,
    });

    controller.setAction('move' satisfies SemanticAction);
    expect(controller.advance(1.1)).toBe(false);
    expect(controller.advance(0.1)).toBe(false);
    controller.dispose();
    controller.dispose();
    expect(controller.advance(1)).toBe(false);
    expect(invalidate).toHaveBeenCalledTimes(2);
  });
});
