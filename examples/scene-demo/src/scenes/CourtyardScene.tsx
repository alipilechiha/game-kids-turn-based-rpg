import type { SceneComponentProps } from '../scene-host.js';
import { courtyardGraph } from '../scene-data.js';
import { getAnchor } from 'waypoint-rpg-core';
import { useDemoState } from './scene-runtime.js';

export function CourtyardScene({ entryAnchorId, runtime }: SceneComponentProps) {
  useDemoState(runtime);
  const entry = getAnchor(courtyardGraph, entryAnchorId);

  return (
    <group name="courtyard-scene">
      <color attach="background" args={['#b7dfca']} />
      <ambientLight intensity={1.4} />
      <directionalLight position={[4, 8, 5]} intensity={1.2} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.08, 0]}>
        <planeGeometry args={[12, 10]} />
        <meshStandardMaterial color="#6fba83" />
      </mesh>
      <mesh position={[entry.x, 0.28, entry.z]}>
        <capsuleGeometry args={[0.25, 0.5, 4, 8]} />
        <meshStandardMaterial color="#f2c75c" />
      </mesh>
      <mesh position={[2, 0.6, 0]}>
        <boxGeometry args={[0.35, 1.2, 0.35]} />
        <meshStandardMaterial color="#80543d" />
      </mesh>
      <mesh position={[-1, 0.9, -2]}>
        <sphereGeometry args={[0.8, 16, 12]} />
        <meshStandardMaterial color="#3f8c52" />
      </mesh>
    </group>
  );
}
