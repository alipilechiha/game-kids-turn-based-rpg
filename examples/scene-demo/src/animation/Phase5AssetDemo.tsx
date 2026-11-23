import { Canvas } from '@react-three/fiber';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { ModelInstance, type ModelLoadStatus } from './ModelInstance.js';
import { phase5AssetRecords } from './asset-records.js';
import { createModelAssetLoader } from './model-loader.js';

const STATIC_ID = 'phase5-textured-static';
const RIGGED_ID = 'phase5-animated-guardian';

function statusAttributes(status: ModelLoadStatus | undefined) {
  if (!status) return { 'data-status': 'loading' };
  if (status.status !== 'ready') return { 'data-status': status.status };
  return {
    'data-status': status.status,
    'data-meshes': String(status.meshes),
    'data-skinned-meshes': String(status.skinnedMeshes),
    'data-clips': status.clips.join(','),
  };
}

export function Phase5AssetDemo() {
  const loader = useMemo(() => createModelAssetLoader(phase5AssetRecords), []);
  const [statuses, setStatuses] = useState<Readonly<Record<string, ModelLoadStatus>>>({});
  const [viewVersion, setViewVersion] = useState(0);
  useEffect(() => () => loader.dispose(), [loader]);
  const onStatus = useCallback((assetId: string, status: ModelLoadStatus) => {
    setStatuses((current) => ({ ...current, [assetId]: status }));
  }, []);

  return (
    <main className="demo-shell phase5-model-demo" data-testid="phase5-model-demo">
      <header className="demo-header">
        <div>
          <p className="eyebrow">Phase 5 · Local model pipeline</p>
          <h1>Textured and rigged GLB assets</h1>
          <p>These authored fixtures load from this application with no remote asset service.</p>
        </div>
        <div className="phase5-model-status" aria-live="polite" aria-label="Model loading status">
          <span>Textured model</span>
          <output data-testid="model-status-static" {...statusAttributes(statuses[STATIC_ID])}>
            {statuses[STATIC_ID]?.status ?? 'loading'}
          </output>
          <span>Rigged character</span>
          <output data-testid="model-status-rigged" {...statusAttributes(statuses[RIGGED_ID])}>
            {statuses[RIGGED_ID]?.status ?? 'loading'}
          </output>
        </div>
      </header>

      <section className="controls" aria-label="Model preview controls">
        <button
          data-testid="model-reload"
          type="button"
          onClick={() => setViewVersion((version) => version + 1)}
        >
          Reload models
        </button>
        <button
          data-testid="return-to-story"
          type="button"
          onClick={() => {
            window.location.search = '';
          }}
        >
          Return to the story
        </button>
        {Object.values(statuses).some((status) => status.status === 'error') && (
          <output role="status" data-testid="model-load-error">
            {Object.values(statuses)
              .filter((status) => status.status === 'error')
              .map((status) => status.message)
              .join(' · ')}
          </output>
        )}
      </section>

      <section className="scene-stage phase5-model-stage" aria-label="Imported 3D model preview">
        <Canvas
          key={viewVersion}
          frameloop="demand"
          camera={{ position: [0, 2.3, 5], fov: 42 }}
          onCreated={({ gl }) => {
            gl.domElement.dataset.testid = 'phase5-model-canvas';
          }}
        >
          <color attach="background" args={['#d9e9ec']} />
          <ambientLight intensity={1.3} />
          <directionalLight position={[3, 5, 4]} intensity={2} />
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]}>
            <planeGeometry args={[6, 4]} />
            <meshStandardMaterial color="#83a78c" />
          </mesh>
          <Suspense fallback={null}>
            <ModelInstance
              key={`${STATIC_ID}:${viewVersion}`}
              assetId={STATIC_ID}
              loader={loader}
              position={[-1.1, 0.02, 0]}
              onStatus={onStatus}
            />
            <ModelInstance
              key={`${RIGGED_ID}:${viewVersion}`}
              assetId={RIGGED_ID}
              loader={loader}
              position={[1.1, 0.02, 0]}
              onStatus={onStatus}
            />
          </Suspense>
        </Canvas>
      </section>
      <p className="phase5-model-provenance">
        Both models are synthetic fixtures covered by this repository’s MIT license. Import records
        include source/output hashes, tool versions, texture and geometry budgets, and animation
        inventory.
      </p>
    </main>
  );
}
