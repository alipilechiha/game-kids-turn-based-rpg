import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrthographicCamera, Vector3, type Group } from 'three';
import { getFact } from 'waypoint-rpg-narrative';
import { getAnchor, type AnchorId } from 'waypoint-rpg-core';
import type { GardenRuntime, GardenState } from '../game/runtime.js';
import {
  gardenTargets,
  gardenGraphs,
  type GardenMapId,
  type GardenTarget,
} from '../world/world.js';
import { SceneCamera } from './SceneCamera.js';
import { sceneForMap } from './registry.js';
import { currentGardenProbe } from './probe.js';

interface GardenSceneProps {
  readonly runtime: GardenRuntime;
  readonly state: GardenState;
  readonly onTargetPress: (targetId: GardenTarget['id']) => void;
}

export function GardenScene({ runtime, state, onTargetPress }: GardenSceneProps) {
  const definition = sceneForMap(state.mapId);
  const entry = getAnchor(definition.graph, state.anchorId);
  const targets = gardenTargets.filter((target) => target.mapId === state.mapId);
  const treeGrown = getFact(state.narrative, 'tree-grown') === true;
  const lanternLit = getFact(state.narrative, 'lantern-lit') === true;

  return (
    <group name={`garden-scene-${state.mapId}`}>
      <SceneCamera mapId={state.mapId} anchorId={state.anchorId} />
      <ContextRecovery />
      <SceneProbe mapId={state.mapId} treeGrown={treeGrown} lanternLit={lanternLit} />
      <ArrivalDriver runtime={runtime} state={state} />
      <color attach="background" args={[state.mapId === 'village' ? '#c7e2cf' : '#a9c8aa']} />
      <ambientLight intensity={1.7} />
      <directionalLight position={[4, 12, 7]} intensity={2.2} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.12, 0]} receiveShadow>
        <planeGeometry args={[17, 15]} />
        <meshStandardMaterial color={state.mapId === 'village' ? '#819c69' : '#71875f'} />
      </mesh>
      <Pathway mapId={state.mapId} />
      <LandmarkDecorations mapId={state.mapId} treeGrown={treeGrown} />
      {targets.map((target) => (
        <WorldTarget
          key={target.id}
          target={target}
          onPress={onTargetPress}
          lanternLit={lanternLit}
        />
      ))}
      <PlayerCharacter anchor={entry} previousAnchorId={state.lastAnchorId} mapId={state.mapId} />
    </group>
  );
}

function ContextRecovery() {
  const { gl, invalidate } = useThree();

  useEffect(() => {
    const canvas = gl.domElement;
    const onContextRestored = () => invalidate();
    canvas.addEventListener('webglcontextrestored', onContextRestored);
    return () => canvas.removeEventListener('webglcontextrestored', onContextRestored);
  }, [gl, invalidate]);

  return null;
}

function ArrivalDriver({ runtime, state }: Pick<GardenSceneProps, 'runtime' | 'state'>) {
  useEffect(() => {
    const walk = state.walk;
    const nextAnchor = walk?.path[walk.nextIndex];
    if (!walk || !nextAnchor) return;
    const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 190;
    const timer = window.setTimeout(() => {
      runtime.dispatch({ type: 'ARRIVE', routeId: walk.routeId, anchorId: nextAnchor });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [runtime, state.walk]);

  return null;
}

function SceneProbe({
  mapId,
  treeGrown,
  lanternLit,
}: {
  readonly mapId: GardenMapId;
  readonly treeGrown: boolean;
  readonly lanternLit: boolean;
}) {
  const { camera, scene, gl, invalidate, size } = useThree();

  useEffect(() => {
    let visibleMeshCount = 0;
    scene.traverse((object) => {
      if (object.type === 'Mesh' && object.visible) visibleMeshCount += 1;
    });
    const cleanupCount = currentGardenProbe()?.cleanupCount ?? 0;
    camera.updateMatrixWorld(true);
    const targetPoints = Object.fromEntries(
      gardenTargets
        .filter((target) => target.mapId === mapId)
        .map((target) => {
          const point = new Vector3(target.position[0], 0.9, target.position[2]).project(camera);
          return [
            target.id,
            { x: ((point.x + 1) / 2) * size.width, y: ((1 - point.y) / 2) * size.height },
          ];
        }),
    );
    const probe = {
      activeMap: mapId,
      cameraKind:
        camera instanceof OrthographicCamera ? ('orthographic' as const) : ('unknown' as const),
      visibleMeshCount,
      frameCount: 0,
      cleanupCount,
      targetPoints,
      renderedConsequences: [
        ...(treeGrown && scene.getObjectByName('garden-grown-tree')?.visible
          ? ['grown-tree' as const]
          : []),
        ...(lanternLit && scene.getObjectByName('lantern-warm-light')?.visible
          ? ['lit-lantern' as const]
          : []),
      ],
    };
    window.__gardenProbe = probe;
    invalidate();

    return () => {
      const previous = window.__gardenProbe;
      if (previous === probe) {
        window.__gardenProbe = { ...probe, cleanupCount: probe.cleanupCount + 1 };
      }
    };
  }, [camera, gl, invalidate, lanternLit, mapId, scene, size.height, size.width, treeGrown]);

  useFrame(() => {
    const probe = currentGardenProbe();
    if (probe?.activeMap === mapId) {
      window.__gardenProbe = { ...probe, frameCount: probe.frameCount + 1 };
    }
  });

  return null;
}

function Pathway({ mapId }: { readonly mapId: GardenMapId }) {
  const stoneColor = mapId === 'village' ? '#c6b58c' : '#b8bb98';
  const segments =
    mapId === 'village'
      ? [
          { position: [0, -0.04, 0.2] as const, rotation: 0, size: [1.5, 8] as const },
          { position: [0, -0.04, -3.2] as const, rotation: Math.PI / 2, size: [1.5, 5] as const },
        ]
      : [
          { position: [0, -0.04, 0.2] as const, rotation: 0, size: [1.5, 8] as const },
          { position: [0, -0.04, -3.5] as const, rotation: Math.PI / 2, size: [1.5, 5] as const },
        ];

  return (
    <group>
      {segments.map((segment, index) => (
        <mesh
          key={index}
          rotation={[-Math.PI / 2, 0, segment.rotation]}
          position={segment.position}
        >
          <planeGeometry args={segment.size} />
          <meshStandardMaterial color={stoneColor} />
        </mesh>
      ))}
    </group>
  );
}

function LandmarkDecorations({
  mapId,
  treeGrown,
}: {
  readonly mapId: GardenMapId;
  readonly treeGrown: boolean;
}) {
  if (mapId === 'village') {
    return (
      <group>
        <SimpleTree position={[-6.2, 0, 3.4]} leafColor="#467d4b" />
        <SimpleTree position={[6.2, 0, 3.4]} leafColor="#5c8d4a" />
        <SimpleTree position={[-6.5, 0, -4.3]} leafColor="#60924e" />
      </group>
    );
  }
  return (
    <group>
      <SimpleTree position={[-6.1, 0, -4.5]} leafColor="#547b46" />
      <SimpleTree position={[6.1, 0, -4.5]} leafColor="#637f45" />
      <SimpleTree position={[-6.1, 0, 3.3]} leafColor="#4a7446" />
      <SimpleTree position={[6.1, 0, 3.3]} leafColor="#718947" />
      {treeGrown ? <BlossomTree position={[0, 0, -1.8]} /> : null}
    </group>
  );
}

function SimpleTree({
  position,
  leafColor,
}: {
  readonly position: [number, number, number];
  readonly leafColor: string;
}) {
  return (
    <group position={position}>
      <mesh position={[0, 0.75, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.28, 1.5, 8]} />
        <meshStandardMaterial color="#78563b" />
      </mesh>
      <mesh position={[0, 1.8, 0]} castShadow>
        <sphereGeometry args={[1, 16, 12]} />
        <meshStandardMaterial color={leafColor} />
      </mesh>
    </group>
  );
}

function PlayerCharacter({
  anchor,
  previousAnchorId,
  mapId,
}: {
  readonly anchor: { readonly x: number; readonly z: number };
  readonly previousAnchorId: string | null;
  readonly mapId: GardenMapId;
}) {
  const groupRef = useRef<Group>(null);
  const elapsed = useRef(0);
  const { invalidate } = useThree();
  const previous = previousAnchorId
    ? getAnchor(gardenGraphs[mapId], previousAnchorId as AnchorId)
    : anchor;
  useEffect(() => {
    elapsed.current = 0;
  }, [anchor.x, anchor.z, previous.x, previous.z]);

  useFrame((_frame, delta) => {
    const group = groupRef.current;
    if (!group) return;
    if (!previousAnchorId) {
      group.position.set(anchor.x, 0, anchor.z);
      return;
    }
    elapsed.current += delta;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const progress = reducedMotion ? 1 : Math.min(1, elapsed.current / 0.18);
    group.position.set(
      previous.x + (anchor.x - previous.x) * progress,
      0,
      previous.z + (anchor.z - previous.z) * progress,
    );
    if (progress < 1) invalidate();
  });

  return (
    <group ref={groupRef} position={[previous.x, 0, previous.z]} name="garden-player">
      <mesh position={[0, 0.68, 0]} castShadow>
        <capsuleGeometry args={[0.28, 0.65, 4, 10]} />
        <meshStandardMaterial color="#c37850" />
      </mesh>
      <mesh position={[0, 1.35, 0]} castShadow>
        <sphereGeometry args={[0.26, 12, 10]} />
        <meshStandardMaterial color="#e8b68d" />
      </mesh>
    </group>
  );
}

function WorldTarget({
  target,
  onPress,
  lanternLit,
}: {
  readonly target: GardenTarget;
  readonly onPress: GardenSceneProps['onTargetPress'];
  readonly lanternLit: boolean;
}) {
  const click = (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
    onPress(target.id);
  };

  return (
    <group position={target.position} name={`world-target-${target.id}`}>
      <TargetModel kind={target.kind} lanternLit={lanternLit} />
      <mesh position={[0, 0.9, 0]} onClick={click}>
        <sphereGeometry args={[0.9, 12, 10]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

function TargetModel({
  kind,
  lanternLit,
}: {
  readonly kind: GardenTarget['kind'];
  readonly lanternLit: boolean;
}) {
  if (kind === 'fountain') return <FountainModel />;
  if (kind === 'market') return <MarketModel />;
  if (kind === 'basket') return <BasketModel />;
  if (kind === 'gardener' || kind === 'traveler')
    return <NpcModel traveler={kind === 'traveler'} />;
  if (kind === 'gate') return <GateModel />;
  if (kind === 'bed') return <PlantBedModel />;
  if (kind === 'stone') return <ClueStoneModel />;
  if (kind === 'guardian') return <GuardianModel />;
  if (kind === 'lantern') return <LanternModel lit={lanternLit} />;
  return <BenchModel />;
}

function GuardianModel() {
  return (
    <group>
      <mesh position={[0, 0.44, 0]} castShadow>
        <dodecahedronGeometry args={[0.64, 1]} />
        <meshStandardMaterial color="#83a8a3" roughness={0.72} />
      </mesh>
      <mesh position={[0, 1.25, 0]} castShadow>
        <sphereGeometry args={[0.43, 16, 12]} />
        <meshStandardMaterial color="#a7c9bb" roughness={0.68} />
      </mesh>
      <mesh position={[-0.17, 1.31, 0.37]}>
        <sphereGeometry args={[0.055, 10, 8]} />
        <meshBasicMaterial color="#415b57" />
      </mesh>
      <mesh position={[0.17, 1.31, 0.37]}>
        <sphereGeometry args={[0.055, 10, 8]} />
        <meshBasicMaterial color="#415b57" />
      </mesh>
    </group>
  );
}

function FountainModel() {
  return (
    <group>
      <mesh position={[0, 0.25, 0]} castShadow>
        <cylinderGeometry args={[1, 1.12, 0.5, 20]} />
        <meshStandardMaterial color="#b6a486" />
      </mesh>
      <mesh position={[0, 0.53, 0]}>
        <cylinderGeometry args={[0.78, 0.78, 0.08, 20]} />
        <meshStandardMaterial color="#8cc5c1" roughness={0.24} />
      </mesh>
    </group>
  );
}

function MarketModel() {
  return (
    <group>
      <mesh position={[0, 1.45, 0]} castShadow>
        <boxGeometry args={[2.4, 0.28, 1.4]} />
        <meshStandardMaterial color="#dfaa67" />
      </mesh>
      {[-0.95, 0.95].map((x) => (
        <mesh key={x} position={[x, 0.68, 0]}>
          <cylinderGeometry args={[0.08, 0.09, 1.3, 8]} />
          <meshStandardMaterial color="#805a3f" />
        </mesh>
      ))}
      <mesh position={[0, 0.48, -0.3]}>
        <boxGeometry args={[1.9, 0.4, 0.5]} />
        <meshStandardMaterial color="#9a7248" />
      </mesh>
    </group>
  );
}

function BasketModel() {
  return (
    <group>
      <mesh position={[0, 0.35, 0]}>
        <cylinderGeometry args={[0.55, 0.42, 0.65, 12, 1, true]} />
        <meshStandardMaterial color="#a87945" side={2} />
      </mesh>
      <mesh position={[0, 0.78, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.42, 0.06, 8, 16, Math.PI]} />
        <meshStandardMaterial color="#805a37" />
      </mesh>
      <mesh position={[0, 0.78, 0]}>
        <sphereGeometry args={[0.16, 10, 8]} />
        <meshStandardMaterial color="#d9b168" />
      </mesh>
    </group>
  );
}

function NpcModel({ traveler }: { readonly traveler: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.64, 0]} castShadow>
        <capsuleGeometry args={[0.38, 0.7, 4, 10]} />
        <meshStandardMaterial color={traveler ? '#587c79' : '#75904e'} />
      </mesh>
      <mesh position={[0, 1.45, 0]} castShadow>
        <sphereGeometry args={[0.32, 12, 10]} />
        <meshStandardMaterial color="#e3b58d" />
      </mesh>
      <mesh position={[0, 1.76, 0]}>
        <coneGeometry args={[0.42, 0.38, 10]} />
        <meshStandardMaterial color={traveler ? '#b16f4b' : '#d1b25d'} />
      </mesh>
    </group>
  );
}

function GateModel() {
  return (
    <group>
      {[-0.8, 0.8].map((x) => (
        <mesh key={x} position={[x, 1, 0]} castShadow>
          <boxGeometry args={[0.24, 2, 0.28]} />
          <meshStandardMaterial color="#846345" />
        </mesh>
      ))}
      <mesh position={[0, 2, 0]} castShadow>
        <boxGeometry args={[1.9, 0.26, 0.3]} />
        <meshStandardMaterial color="#926b48" />
      </mesh>
      <mesh position={[0, 1.55, 0.03]}>
        <boxGeometry args={[1.2, 0.42, 0.08]} />
        <meshStandardMaterial color="#b5c88d" />
      </mesh>
    </group>
  );
}

function PlantBedModel() {
  return (
    <group>
      <mesh position={[0, 0.18, 0]}>
        <boxGeometry args={[2.8, 0.35, 1.7]} />
        <meshStandardMaterial color="#71563f" />
      </mesh>
      <mesh position={[0, 0.38, 0]}>
        <boxGeometry args={[2.55, 0.12, 1.45]} />
        <meshStandardMaterial color="#694b37" />
      </mesh>
    </group>
  );
}

function ClueStoneModel() {
  return (
    <mesh position={[0, 0.65, 0]} rotation={[0.16, 0.15, 0]} castShadow>
      <dodecahedronGeometry args={[0.95, 0]} />
      <meshStandardMaterial color="#948c79" roughness={0.92} />
    </mesh>
  );
}

function LanternModel({ lit }: { readonly lit: boolean }) {
  return (
    <group>
      {lit ? (
        <pointLight
          name="lantern-warm-light"
          position={[0, 2.45, 0]}
          color="#ffd875"
          intensity={2.4}
          distance={7}
        />
      ) : null}
      <mesh position={[0, 1.1, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.15, 2.2, 8]} />
        <meshStandardMaterial color="#6f573d" />
      </mesh>
      <mesh position={[0, 2.4, 0]} castShadow>
        <boxGeometry args={[0.65, 0.75, 0.55]} />
        <meshStandardMaterial color="#8e7751" />
      </mesh>
      <mesh position={[0, 2.4, 0.01]}>
        <boxGeometry args={[0.4, 0.5, 0.39]} />
        <meshStandardMaterial
          color={lit ? '#fff0a6' : '#c7a763'}
          emissive={lit ? '#ffc943' : '#000000'}
          emissiveIntensity={lit ? 1.4 : 0}
        />
      </mesh>
    </group>
  );
}

function BlossomTree({ position }: { readonly position: [number, number, number] }) {
  return (
    <group position={position} name="garden-grown-tree">
      <mesh position={[0, 0.9, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.28, 1.8, 8]} />
        <meshStandardMaterial color="#805637" />
      </mesh>
      <mesh position={[0, 2.05, 0]} castShadow>
        <sphereGeometry args={[1.05, 18, 14]} />
        <meshStandardMaterial color="#5e9b58" />
      </mesh>
      <mesh position={[-0.5, 2.2, 0.65]}>
        <sphereGeometry args={[0.32, 12, 10]} />
        <meshStandardMaterial color="#f2c8c0" />
      </mesh>
      <mesh position={[0.46, 2.55, 0.54]}>
        <sphereGeometry args={[0.3, 12, 10]} />
        <meshStandardMaterial color="#f7e0a0" />
      </mesh>
    </group>
  );
}

function BenchModel() {
  return (
    <group>
      <mesh position={[0, 0.6, 0]} castShadow>
        <boxGeometry args={[1.9, 0.18, 0.65]} />
        <meshStandardMaterial color="#95663f" />
      </mesh>
      <mesh position={[0, 0.95, -0.23]}>
        <boxGeometry args={[1.9, 0.56, 0.16]} />
        <meshStandardMaterial color="#a9784b" />
      </mesh>
      {[-0.68, 0.68].map((x) => (
        <mesh key={x} position={[x, 0.28, 0]}>
          <boxGeometry args={[0.16, 0.58, 0.18]} />
          <meshStandardMaterial color="#704e33" />
        </mesh>
      ))}
    </group>
  );
}
