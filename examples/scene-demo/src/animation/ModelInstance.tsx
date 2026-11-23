import { useEffect, useState } from 'react';
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
  readonly assetId: string;
  readonly loader: ModelAssetLoader;
  readonly position: readonly [number, number, number];
  readonly onStatus: (assetId: string, status: ModelLoadStatus) => void;
}

export function ModelInstance({ assetId, loader, position, onStatus }: ModelInstanceProps) {
  const [lease, setLease] = useState<ModelLease | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;
    let ownedLease: ModelLease | null = null;
    onStatus(assetId, { status: 'loading' });
    void loader
      .load(assetId, controller.signal)
      .then((loaded) => {
        if (!mounted || controller.signal.aborted) {
          loaded.release();
          return;
        }
        ownedLease = loaded;
        setLease(loaded);
        let meshes = 0;
        let skinnedMeshes = 0;
        loaded.root.traverse((object) => {
          if ((object as { isMesh?: boolean }).isMesh) meshes += 1;
          if ((object as { isSkinnedMesh?: boolean }).isSkinnedMesh) skinnedMeshes += 1;
        });
        onStatus(assetId, {
          status: 'ready',
          meshes,
          skinnedMeshes,
          clips: loaded.clips.map((clip) => clip.name),
        });
      })
      .catch((error: unknown) => {
        if (!mounted || controller.signal.aborted) return;
        onStatus(assetId, {
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      mounted = false;
      controller.abort();
      ownedLease?.release();
    };
  }, [assetId, loader, onStatus]);

  if (!lease) return null;
  return <primitive object={lease.root} position={position} dispose={null} />;
}
