import { Canvas } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { faUi } from './content/fa/ui.js';
import { createGardenRuntime } from './game/runtime.js';
import { GardenScene } from './scenes/GardenScene.js';
import { gardenTargets, getGardenTarget, type GardenTargetId } from './world/world.js';

export function App() {
  const runtime = useMemo(() => createGardenRuntime(), []);
  const state = useSyncExternalStore(runtime.subscribe, runtime.getState, runtime.getState);
  const [rendererReady, setRendererReady] = useState(false);

  useEffect(() => () => runtime.dispose(), [runtime]);

  const onTargetPress = useCallback(
    (targetId: GardenTargetId) => {
      const current = runtime.getState();
      if (current.phase !== 'playing') return;
      const target = getGardenTarget(targetId);
      if (!target || target.mapId !== current.mapId) return;
      if (target.anchorId === current.anchorId && !current.walk) {
        runtime.dispatch({ type: 'INTERACT', targetId });
        return;
      }
      runtime.dispatch({ type: 'MOVE_TO', targetId });
    },
    [runtime],
  );

  const mapLabel = faUi[state.mapId];
  const statusText = state.walk
    ? faUi.arriving
    : state.lastInteractionTarget
      ? `${faUi.reached}: ${faUi.targets[state.lastInteractionTarget]}`
      : faUi.choosePlace;

  return (
    <main className="garden-shell">
      <header className="garden-header">
        <span className="garden-mark" aria-hidden="true">
          ✿
        </span>
        <div className="garden-heading">
          <h1>{faUi.title}</h1>
          <p>{faUi.subtitle}</p>
        </div>
        {state.phase === 'playing' ? (
          <button
            className="quiet-button"
            data-testid="garden-new-game"
            type="button"
            onClick={() => runtime.dispatch({ type: 'NEW_GAME' })}
          >
            {faUi.newGame}
          </button>
        ) : null}
      </header>

      {state.phase === 'title' ? (
        <section className="title-card" aria-label={faUi.title}>
          <div className="title-art" aria-hidden="true">
            🌱
          </div>
          <button
            className="primary-button"
            data-testid="garden-start"
            type="button"
            onClick={() => runtime.dispatch({ type: 'NEW_GAME' })}
          >
            {faUi.start}
          </button>
        </section>
      ) : (
        <section className="game-shell" aria-label={mapLabel} data-active-scene={state.mapId}>
          <div className="scene-frame" data-testid={`scene-${state.mapId}`}>
            <Canvas
              data-testid="garden-canvas-wrapper"
              frameloop="demand"
              camera={{ position: [0, 12, 14], fov: 42 }}
              onCreated={({ gl }) => {
                gl.domElement.dataset.testid = 'garden-canvas';
                gl.domElement.dataset.cameraKind = 'loading';
                setRendererReady(true);
              }}
            >
              <GardenScene
                key={state.mapId}
                runtime={runtime}
                state={state}
                onTargetPress={onTargetPress}
              />
            </Canvas>
            {!rendererReady ? (
              <div className="loading-message" role="status">
                {faUi.loading}
              </div>
            ) : null}
          </div>

          <div className="play-controls">
            <div className="map-status">
              <p className="location-label" data-testid="active-map" aria-live="polite">
                {mapLabel}
              </p>
              <p className="movement-status" role="status" data-testid="movement-status">
                {statusText}
              </p>
            </div>
            <nav className="target-navigation" aria-label={faUi.targetsHeading}>
              {gardenTargets
                .filter((target) => target.mapId === state.mapId)
                .map((target) => {
                  const label = faUi.targets[target.id];
                  const nearby = target.anchorId === state.anchorId && !state.walk;
                  return (
                    <button
                      className="target-button"
                      key={target.id}
                      data-testid={`target-${target.id}`}
                      data-nearby={nearby}
                      type="button"
                      aria-label={`${label}، ${nearby ? faUi.interact : faUi.approach}`}
                      aria-pressed={nearby}
                      onClick={() => onTargetPress(target.id)}
                    >
                      <span className="target-button-mark" aria-hidden="true">
                        {target.kind === 'gardener' || target.kind === 'traveler'
                          ? '●'
                          : target.kind === 'gate'
                            ? '⌂'
                            : '◆'}
                      </span>
                      <span>{label}</span>
                    </button>
                  );
                })}
            </nav>
          </div>
        </section>
      )}
    </main>
  );
}
