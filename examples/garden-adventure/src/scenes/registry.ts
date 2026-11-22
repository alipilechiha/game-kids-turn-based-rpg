import type { GraphSource, WorldMap } from 'waypoint-rpg-core';
import { gardenGraphs, gardenMaps, type GardenMapId } from '../world/world.js';

export interface GardenSceneDefinition {
  readonly map: WorldMap;
  readonly graph: GraphSource;
  readonly camera: 'orthographic';
}

export const gardenSceneRegistry: Readonly<Record<GardenMapId, GardenSceneDefinition>> = {
  village: { map: gardenMaps.village, graph: gardenGraphs.village, camera: 'orthographic' },
  garden: { map: gardenMaps.garden, graph: gardenGraphs.garden, camera: 'orthographic' },
};

export function sceneForMap(mapId: GardenMapId): GardenSceneDefinition {
  return gardenSceneRegistry[mapId];
}
