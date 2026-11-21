import { getAnchor } from 'waypoint-rpg-core';
import type { SceneComponentProps } from '../scene-host.js';
import { workshopGraph } from '../scene-data.js';
import { sceneProbe } from '../probe.js';
import { useDemoState } from './scene-runtime.js';

export function WorkshopScene({ entryAnchorId, runtime }: SceneComponentProps) {
  const state = useDemoState(runtime);
  const entry = getAnchor(workshopGraph, entryAnchorId);

  return (
    <group name="workshop-scene">
      <color attach="background" args={['#d6e1ed']} />
      <ambientLight intensity={0.8} />
      <directionalLight position={[-4, 7, 5]} intensity={1} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.08, 0]}>
        <planeGeometry args={[10, 10]} />
        <meshStandardMaterial color="#8795a7" />
      </mesh>
      <mesh position={[entry.x, 0.28, entry.z]}>
        <capsuleGeometry args={[0.25, 0.5, 4, 8]} />
        <meshStandardMaterial color="#f2c75c" />
      </mesh>
      <mesh position={[1, 1.2, 1]}>
        <cylinderGeometry args={[0.12, 0.18, 1.5, 12]} />
        <meshStandardMaterial
          color={state.lampLit ? '#ffe48b' : '#6b7077'}
          emissive={state.lampLit ? '#ffc83d' : '#000000'}
          emissiveIntensity={state.lampLit ? 1.5 : 0}
        />
      </mesh>
      <pointLight
        position={[1, 2, 1]}
        color="#ffd96b"
        intensity={state.lampLit ? 2 : 0}
        distance={6}
      />
      <WorkshopProbe lit={state.lampLit} />
    </group>
  );
}

function WorkshopProbe({ lit }: { readonly lit: boolean }) {
  const probe = sceneProbe();
  if (probe) probe.lampLit = lit;
  return null;
}
