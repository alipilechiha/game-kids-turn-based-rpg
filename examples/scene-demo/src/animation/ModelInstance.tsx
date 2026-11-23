import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import type { CharacterAnimationController } from './character-animation.js';
import { createCharacterAnimationController } from './character-animation.js';
import type { SemanticAction } from './contracts.js';
import type { ModelAssetLoader, ModelLease } from './model-loader.js';

export type ModelLoadStatus =
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready';
      readonly meshes: number;
      readonly skinnedMeshes: number;
      readonly clips: readonly string[];
    }
  | { readonly status: 'error'; readonly message: string };

interface ModelInstanceProps {
  readonly instanceId: string;
  readonly assetId: string;
  readonly loader: ModelAssetLoader;
  readonly position: readonly [number, number, number];
  readonly action: SemanticAction;
  readonly actionRevision: number;
  readonly reducedMotion: boolean;
  readonly onStatus: (instanceId: string, status: ModelLoadStatus) => void;
}

export function ModelInstance({
  instanceId,
  assetId,
  loader,
  position,
  action,
  actionRevision,
  reducedMotion,
  onStatus,
}: ModelInstanceProps) {
  const [lease, setLease] = useState<ModelLease | null>(null);
  const animationRef = useRef<CharacterAnimationController | null>(null);
  const invalidate = useThree((state) => state.invalidate);
  const invalidateRef = useRef(invalidate);
  const presentationRef = useRef({ action, reducedMotion });

  useEffect(() => {
    invalidateRef.current = invalidate;
  }, [invalidate]);

  useEffect(() => {
    presentationRef.current = { action, reducedMotion };
    animationRef.current?.setAction(action, { reducedMotion });
  }, [action, actionRevision, reducedMotion]);

  useFrame((_, deltaSeconds) => {
    animationRef.current?.advance(deltaSeconds);
  });

  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;
    let ownedLease: ModelLease | null = null;
    let animation: CharacterAnimationController | null = null;
    onStatus(instanceId, { status: 'loading' });
    void loader
      .load(assetId, controller.signal)
      .then((loaded) => {
        if (!mounted || controller.signal.aborted) {
          loaded.release();
          return;
        }
        ownedLease = loaded;
        loaded.root.name = `phase5:${instanceId}`;
        loaded.root.userData.phase5InstanceId = instanceId;
        animation = createCharacterAnimationController(loaded.root, loaded.clips, loaded.record, {
          invalidate: () => invalidateRef.current(),
        });
        animationRef.current = animation;
        animation.setAction(presentationRef.current.action, {
          reducedMotion: presentationRef.current.reducedMotion,
        });
        setLease(loaded);
        let meshes = 0;
        let skinnedMeshes = 0;
        loaded.root.traverse((object) => {
          if ((object as { isMesh?: boolean }).isMesh) meshes += 1;
          if ((object as { isSkinnedMesh?: boolean }).isSkinnedMesh) skinnedMeshes += 1;
        });
        onStatus(instanceId, {
          status: 'ready',
          meshes,
          skinnedMeshes,
          clips: loaded.clips.map((clip) => clip.name),
        });
      })
      .catch((error: unknown) => {
        if (!mounted || controller.signal.aborted) return;
        onStatus(instanceId, {
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      mounted = false;
      controller.abort();
      if (animationRef.current === animation) animationRef.current = null;
      animation?.dispose();
      ownedLease?.release();
    };
  }, [assetId, instanceId, loader, onStatus]);

  if (!lease) return null;
  return <primitive object={lease.root} position={position} dispose={null} />;
}
