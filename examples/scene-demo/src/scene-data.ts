import type { Anchor, GraphSource, MapTransition, WorldMap } from 'waypoint-rpg-core';

const courtyardId = 'map-courtyard';
const workshopId = 'map-workshop';

function anchor(id: Anchor['id'], mapId: Anchor['mapId'], x: number, z: number): Anchor {
  return {
    id,
    x,
    z,
    walkable: true,
    areaId: mapId === courtyardId ? 'area-courtyard' : 'area-workshop',
    mapId,
    npcId: null,
    landmarkId: null,
  };
}

export const courtyardMap: WorldMap = {
  id: courtyardId,
  bounds: { minX: -5, maxX: 5, minZ: -4, maxZ: 4 },
  spawnAnchorId: 'anchor-courtyard-start',
};

export const workshopMap: WorldMap = {
  id: workshopId,
  bounds: { minX: -4, maxX: 4, minZ: -4, maxZ: 4 },
  spawnAnchorId: 'anchor-workshop-door',
};

export const courtyardGraph: GraphSource = {
  anchors: [
    anchor('anchor-courtyard-start', courtyardId, -2, 1),
    anchor('anchor-courtyard-door', courtyardId, 2, 0),
    anchor('anchor-courtyard-tree', courtyardId, -1, -2),
  ],
  edges: [
    { from: 'anchor-courtyard-start', to: 'anchor-courtyard-door' },
    { from: 'anchor-courtyard-start', to: 'anchor-courtyard-tree' },
  ],
};

export const workshopGraph: GraphSource = {
  anchors: [
    anchor('anchor-workshop-door', workshopId, -2, 0),
    anchor('anchor-workshop-lamp', workshopId, 1, 1),
    anchor('anchor-workshop-exit', workshopId, 2, -2),
  ],
  edges: [
    { from: 'anchor-workshop-door', to: 'anchor-workshop-lamp' },
    { from: 'anchor-workshop-lamp', to: 'anchor-workshop-exit' },
  ],
};

export const sceneTransitions: readonly MapTransition[] = [
  {
    id: 'transition-to-workshop',
    fromMap: courtyardMap.id,
    fromAnchor: 'anchor-courtyard-door',
    toMap: workshopMap.id,
    toAnchor: 'anchor-workshop-door',
  },
  {
    id: 'transition-to-courtyard',
    fromMap: workshopMap.id,
    fromAnchor: 'anchor-workshop-exit',
    toMap: courtyardMap.id,
    toAnchor: 'anchor-courtyard-door',
  },
];
