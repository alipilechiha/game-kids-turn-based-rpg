import { useEffect } from 'react';
import { OrthographicCamera } from 'three';
import { useThree } from '@react-three/fiber';
import { getAnchor } from 'waypoint-rpg-core';
import { gardenGraphs, type GardenMapId } from '../world/world.js';

interface SceneCameraProps {
  readonly mapId: GardenMapId;
  readonly anchorId: string;
}

export function SceneCamera({ mapId, anchorId }: SceneCameraProps) {
  const { set, invalidate, size } = useThree();
  const anchor = getAnchor(gardenGraphs[mapId], anchorId as never);

  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    const halfHeight = 8;
    const camera = new OrthographicCamera(
      -halfHeight * aspect,
      halfHeight * aspect,
      halfHeight,
      -halfHeight,
      0.1,
      100,
    );
    camera.name = `garden-${mapId}-camera`;
    camera.position.set(anchor.x, 15, anchor.z + 11);
    camera.lookAt(anchor.x, 0, anchor.z);
    camera.updateProjectionMatrix();
    set({ camera });
    invalidate();
  }, [anchor.x, anchor.z, invalidate, mapId, set, size.height, size.width]);

  return null;
}
