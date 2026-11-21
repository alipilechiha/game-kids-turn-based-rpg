import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Canvas } from '@react-three/fiber';
import { getAnchor } from 'waypoint-rpg-core';
import { SceneCamera } from './SceneCamera.js';
import { SceneFrameProbe } from './SceneFrameProbe.js';
import { createDemoRuntime } from './runtime.js';
import { SceneHost } from './scene-host.js';
import { sceneRegistry } from './scenes/registry.js';
import { subscribeDemoRuntime } from './scenes/scene-runtime.js';

export function App() {
  const host = useMemo(() => new SceneHost(sceneRegistry), []);
  const runtime = useMemo(() => createDemoRuntime(), []);
  const snapshot = useSyncExternalStore(host.subscribe, host.getSnapshot, host.getSnapshot);
  const subscribeRuntime = useCallback(
    (listener: () => void) => subscribeDemoRuntime(runtime, listener),
    [runtime],
  );
  const facts = useSyncExternalStore(subscribeRuntime, runtime.getState, runtime.getState);
  const [canvasVersion, setCanvasVersion] = useState(0);
  const [contextLost, setContextLost] = useState(false);
  const canvasLive = useRef(false);

  useEffect(() => {
    void host.start('map-courtyard');
    return () => {
      canvasLive.current = false;
      host.dispose();
      runtime.dispose();
    };
  }, [host, runtime]);

  const onContextLost = useCallback((event: Event) => {
    event.preventDefault();
    if (!canvasLive.current) return;
    canvasLive.current = false;
    setContextLost(true);
  }, []);

  const onCreated = useCallback(
    ({ gl }: { gl: { domElement: HTMLCanvasElement } }) => {
      canvasLive.current = true;
      gl.domElement.dataset.testid = 'scene-canvas';
      gl.domElement.addEventListener('webglcontextlost', onContextLost, { once: true });
    },
    [onContextLost],
  );

  const active = snapshot.active;
  const ActiveScene = active?.resource.Component;
  const activeAnchorId = snapshot.currentAnchorId ?? active?.entryAnchorId;
  const target =
    active && activeAnchorId ? getAnchor(active.definition.graph, activeAnchorId) : null;
  const toWorkshop = active?.definition.map.id !== 'map-workshop';
  const transitionId = toWorkshop ? 'transition-to-workshop' : 'transition-to-courtyard';
  const transitionLabel = toWorkshop ? 'Travel to workshop' : 'Return to courtyard';

  return (
    <main className="demo-shell">
      <header className="demo-header">
        <div>
          <p className="eyebrow">Independent consumer</p>
          <h1>Three.js scene integration</h1>
          <p>Two registered maps use only the published core package.</p>
        </div>
        <div className="status-grid" aria-live="polite">
          <span>Map</span>
          <output data-testid="active-map">{active?.definition.map.id ?? 'loading'}</output>
          <span>Camera</span>
          <output data-testid="camera-kind">{active?.definition.camera.kind ?? 'loading'}</output>
          <span>Arrival</span>
          <output data-testid="entry-anchor">{active?.entryAnchorId ?? 'loading'}</output>
        </div>
      </header>

      <section className="controls" aria-label="Demo controls">
        <button
          data-testid="scene-transition"
          type="button"
          disabled={!active || snapshot.pendingMapId !== null}
          onClick={() => void host.transition(transitionId)}
        >
          {snapshot.pendingMapId ? `Loading ${snapshot.pendingMapId}…` : transitionLabel}
        </button>
        <button
          data-testid="lamp-toggle"
          type="button"
          aria-pressed={facts.lampLit}
          onClick={() => runtime.dispatch({ type: 'TOGGLE_LAMP' })}
        >
          Lantern: {facts.lampLit ? 'on' : 'off'}
        </button>
        <output className="error" data-testid="scene-error" role="status">
          {snapshot.error ?? ''}
        </output>
      </section>

      <section className="scene-stage" aria-label="3D game scene">
        {active && ActiveScene && target ? (
          <Canvas
            key={canvasVersion}
            frameloop="demand"
            camera={{ position: [0, 8, 9], fov: 48 }}
            onCreated={onCreated}
          >
            <SceneFrameProbe />
            <SceneCamera configuration={active.definition.camera} target={target} />
            <ActiveScene entryAnchorId={active.entryAnchorId} runtime={runtime} />
          </Canvas>
        ) : (
          <p className="loading" data-testid="scene-loading">
            {snapshot.error ? 'Scene failed to load.' : 'Loading first scene…'}
          </p>
        )}
      </section>

      {contextLost && (
        <div className="recovery" role="alert">
          <span>Graphics stopped. Rebuild the view to continue.</span>
          <button
            data-testid="restore-context"
            type="button"
            onClick={() => {
              canvasLive.current = false;
              setContextLost(false);
              setCanvasVersion((version) => version + 1);
            }}
          >
            Rebuild 3D view
          </button>
        </div>
      )}
    </main>
  );
}
