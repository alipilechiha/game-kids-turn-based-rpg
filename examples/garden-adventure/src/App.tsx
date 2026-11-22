import { Canvas } from '@react-three/fiber';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { faUi } from './content/fa/ui.js';
import { createGardenRuntime } from './game/runtime.js';

export function App() {
  const runtime = useMemo(() => createGardenRuntime(), []);
  const state = useSyncExternalStore(runtime.subscribe, runtime.getState, runtime.getState);

  useEffect(() => () => runtime.dispose(), [runtime]);

  return (
    <main className="garden-shell">
      <header className="garden-header">
        <span className="garden-mark" aria-hidden="true">
          ✿
        </span>
        <div>
          <h1>{faUi.title}</h1>
          <p>{faUi.subtitle}</p>
        </div>
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
        <section className="game-shell" aria-label={faUi.village}>
          <div className="scene-frame">
            <Canvas
              data-testid="garden-canvas-wrapper"
              frameloop="demand"
              camera={{ position: [0, 12, 14], fov: 42 }}
              onCreated={({ gl }) => {
                gl.domElement.dataset.testid = 'garden-canvas';
              }}
            >
              <color attach="background" args={['#b8d9c2']} />
              <ambientLight intensity={1.8} />
              <directionalLight position={[5, 10, 7]} intensity={2.4} />
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.3, 0]}>
                <planeGeometry args={[22, 22]} />
                <meshStandardMaterial color="#779a66" />
              </mesh>
              <mesh position={[0, 0.55, 0]}>
                <capsuleGeometry args={[0.3, 0.55, 4, 8]} />
                <meshStandardMaterial color="#bd7651" />
              </mesh>
            </Canvas>
          </div>
          <p className="location-label" data-testid="active-map">
            {faUi.village}
          </p>
        </section>
      )}
    </main>
  );
}
