import { Canvas } from '@react-three/fiber';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { transitionGameplay } from 'waypoint-rpg-gameplay';
import type { SemanticAction } from './contracts.js';
import {
  createAnimationGameplayDemo,
  createAnimationMoveCommand,
  projectGameplayAnimationChanges,
} from './gameplay-demo.js';
import { ModelInstance, type ModelLoadStatus } from './ModelInstance.js';
import { phase5AssetRecords } from './asset-records.js';
import { createModelAssetLoader } from './model-loader.js';

const STATIC_ID = 'phase5-textured-static';
const RIGGED_ID = 'phase5-animated-guardian';
const TRAVELER_INSTANCE_ID = 'traveler';
const GUARDIAN_INSTANCE_ID = 'guardian';

function participantPosition(
  state: ReturnType<typeof createAnimationGameplayDemo>['state'],
  participantId: string,
): readonly [number, number, number] {
  const position = state.encounter?.combatants.find((item) => item.id === participantId)?.position;
  if (!position) return [0, 0, 0];
  return [(position.x - 3) * 0.48, 0.02, -0.1];
}

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
  const [gameplay, setGameplay] = useState(() => createAnimationGameplayDemo());
  const [actions, setActions] = useState<Readonly<Record<string, SemanticAction>>>(() => ({
    [TRAVELER_INSTANCE_ID]: 'idle',
    [GUARDIAN_INSTANCE_ID]: 'idle',
  }));
  const [gameplayFeedback, setGameplayFeedback] = useState('');
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => () => loader.dispose(), [loader]);
  const onStatus = useCallback((instanceId: string, status: ModelLoadStatus) => {
    setStatuses((current) => ({ ...current, [instanceId]: status }));
  }, []);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setReducedMotion(preference.matches);
    updatePreference();
    preference.addEventListener('change', updatePreference);
    return () => preference.removeEventListener('change', updatePreference);
  }, []);
  const movePlayer = useCallback(() => {
    const command = createAnimationMoveCommand(gameplay.state);
    const result = transitionGameplay(gameplay.compiled, gameplay.state, command);
    if (!result.accepted) {
      setGameplayFeedback(result.reason.message);
      return;
    }
    const updates = projectGameplayAnimationChanges(gameplay.state, result, command);
    setGameplay({ compiled: gameplay.compiled, state: result.state });
    setActions((current) => ({ ...current, ...updates }));
    setGameplayFeedback(`Accepted movement · revision ${result.state.revision}`);
  }, [gameplay]);
  const restartEncounter = useCallback(() => {
    setGameplay(createAnimationGameplayDemo(`phase5-animation-playthrough-${Date.now()}`));
    setActions({ [TRAVELER_INSTANCE_ID]: 'idle', [GUARDIAN_INSTANCE_ID]: 'idle' });
    setGameplayFeedback('A new encounter is ready.');
  }, []);
  const traveler = gameplay.state.encounter?.combatants.find((item) => item.id === 'traveler');
  const guardian = gameplay.state.encounter?.combatants.find((item) => item.id === 'guardian');

  return (
    <main className="demo-shell phase5-model-demo" data-testid="phase5-model-demo">
      <header className="demo-header">
        <div>
          <p className="eyebrow">Phase 5 · Local model pipeline</p>
          <h1>Textured and rigged GLB assets</h1>
          <p>
            Local GLBs respond to a real deterministic tactical move and independent character
            mixers.
          </p>
        </div>
        <div className="phase5-model-status" aria-live="polite" aria-label="Model loading status">
          <span>Textured model</span>
          <output
            data-testid="model-status-static"
            {...statusAttributes(statuses['static-preview'])}
          >
            {statuses['static-preview']?.status ?? 'loading'}
          </output>
          <span>Rigged character</span>
          <output
            data-testid="model-status-rigged"
            {...statusAttributes(statuses[TRAVELER_INSTANCE_ID])}
          >
            {statuses[TRAVELER_INSTANCE_ID]?.status ?? 'loading'}
          </output>
          <span>Traveler instance</span>
          <output
            data-testid="model-status-traveler"
            {...statusAttributes(statuses[TRAVELER_INSTANCE_ID])}
          >
            {statuses[TRAVELER_INSTANCE_ID]?.status ?? 'loading'}
          </output>
          <span>Guardian instance</span>
          <output
            data-testid="model-status-guardian"
            {...statusAttributes(statuses[GUARDIAN_INSTANCE_ID])}
          >
            {statuses[GUARDIAN_INSTANCE_ID]?.status ?? 'loading'}
          </output>
        </div>
      </header>

      <section className="controls" aria-label="Model and gameplay controls">
        <button
          data-testid="model-reload"
          type="button"
          onClick={() => setViewVersion((version) => version + 1)}
        >
          Reload models
        </button>
        <button
          data-testid="gameplay-move"
          type="button"
          disabled={gameplay.state.encounter?.outcome !== null || !traveler || !guardian}
          onClick={movePlayer}
        >
          Move through turn-based rules
        </button>
        <button data-testid="gameplay-reset" type="button" onClick={restartEncounter}>
          Restart encounter
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
        <output data-testid="gameplay-revision">Revision {gameplay.state.revision}</output>
        <output data-testid="gameplay-traveler-position">
          Traveler cell {traveler?.position.x},{traveler?.position.y}
        </output>
        <output data-testid="gameplay-guardian-position">
          Guardian cell {guardian?.position.x},{guardian?.position.y}
        </output>
        <output data-testid="animation-action-traveler">
          Traveler action {actions[TRAVELER_INSTANCE_ID]}
        </output>
        <output data-testid="animation-action-guardian">
          Guardian action {actions[GUARDIAN_INSTANCE_ID]}
        </output>
        <output data-testid="reduced-motion-state" data-reduced-motion={String(reducedMotion)}>
          {reducedMotion ? 'Reduced motion' : 'Full motion'}
        </output>
        <output data-testid="gameplay-feedback" role="status" aria-live="polite">
          {gameplayFeedback}
        </output>
        {Object.values(statuses).some((status) => status.status === 'error') && (
          <output role="status" data-testid="model-load-error">
            {Object.values(statuses)
              .filter((status) => status.status === 'error')
              .map((status) => status.message)
              .join(' · ')}
          </output>
        )}
      </section>

      <section
        className="scene-stage phase5-model-stage"
        aria-label="Imported 3D model and animation preview"
      >
        <Canvas
          key={viewVersion}
          frameloop="demand"
          camera={{ position: [0, 3.1, 7], fov: 42 }}
          onCreated={({ gl }) => {
            gl.domElement.dataset.testid = 'phase5-model-canvas';
          }}
        >
          <color attach="background" args={['#d9e9ec']} />
          <ambientLight intensity={1.3} />
          <directionalLight position={[3, 5, 4]} intensity={2} />
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]}>
            <planeGeometry args={[7, 4]} />
            <meshStandardMaterial color="#83a78c" />
          </mesh>
          <Suspense fallback={null}>
            <ModelInstance
              instanceId="static-preview"
              key={`${STATIC_ID}:${viewVersion}`}
              assetId={STATIC_ID}
              loader={loader}
              position={[0, 0.02, 1.1]}
              action="idle"
              actionRevision={gameplay.state.revision}
              reducedMotion={reducedMotion}
              onStatus={onStatus}
            />
            <ModelInstance
              instanceId={TRAVELER_INSTANCE_ID}
              key={`${RIGGED_ID}:${TRAVELER_INSTANCE_ID}:${viewVersion}`}
              assetId={RIGGED_ID}
              loader={loader}
              position={participantPosition(gameplay.state, 'traveler')}
              action={actions[TRAVELER_INSTANCE_ID] ?? 'idle'}
              actionRevision={gameplay.state.revision}
              reducedMotion={reducedMotion}
              onStatus={onStatus}
            />
            <ModelInstance
              instanceId={GUARDIAN_INSTANCE_ID}
              key={`${RIGGED_ID}:${GUARDIAN_INSTANCE_ID}:${viewVersion}`}
              assetId={RIGGED_ID}
              loader={loader}
              position={participantPosition(gameplay.state, 'guardian')}
              action={actions[GUARDIAN_INSTANCE_ID] ?? 'idle'}
              actionRevision={gameplay.state.revision}
              reducedMotion={reducedMotion}
              onStatus={onStatus}
            />
          </Suspense>
        </Canvas>
      </section>
      <p className="phase5-model-provenance">
        Both model fixtures are synthetic and covered by this repository’s MIT license. The two
        rigged instances own separate skeletons and mixers; the move control commits a Phase 4
        gameplay transition before selecting their movement clips. Import records include hashes,
        provenance, budgets, and animation inventory.
      </p>
    </main>
  );
}
