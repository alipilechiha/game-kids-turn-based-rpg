import type {
  Anchor,
  AnchorId,
  AreaId,
  Edge,
  GraphSource,
  LandmarkId,
  MapId,
  MapTransition,
  NpcId,
  TransitionId,
  WorldMap,
} from 'waypoint-rpg-core';

export type GardenMapId = 'village' | 'garden';

export type GardenTargetId =
  | 'fountain'
  | 'market'
  | 'seed-basket'
  | 'gardener'
  | 'traveler'
  | 'garden-gate'
  | 'planting-bed'
  | 'clue-stone'
  | 'ancient-lantern'
  | 'recap-bench'
  | 'village-gate';

export type GardenTargetKind =
  | 'fountain'
  | 'market'
  | 'basket'
  | 'gardener'
  | 'traveler'
  | 'gate'
  | 'bed'
  | 'stone'
  | 'lantern'
  | 'bench';

export interface GardenTarget {
  readonly id: GardenTargetId;
  readonly mapId: GardenMapId;
  readonly anchorId: AnchorId;
  readonly kind: GardenTargetKind;
  readonly position: readonly [number, number, number];
}

export type GardenAnchor = Anchor & { readonly targetId?: GardenTargetId };

const mapId = (id: GardenMapId): MapId =>
  (id === 'village' ? 'map-village' : 'map-garden') as MapId;
const anchorId = (id: string): AnchorId => id as AnchorId;

function anchor(
  id: string,
  map: GardenMapId,
  x: number,
  z: number,
  targetId?: GardenTargetId,
): GardenAnchor {
  const npcId: NpcId | null =
    targetId === 'gardener'
      ? ('npc-gardener' as NpcId)
      : targetId === 'traveler'
        ? ('npc-traveler' as NpcId)
        : null;

  return {
    id: anchorId(id),
    x,
    z,
    walkable: true,
    areaId: `${map}-area` as AreaId,
    mapId: mapId(map),
    npcId,
    landmarkId: targetId ? (targetId as LandmarkId) : null,
    ...(targetId === 'garden-gate'
      ? { transitionId: 'transition-to-garden' as TransitionId }
      : targetId === 'village-gate'
        ? { transitionId: 'transition-to-village' as TransitionId }
        : {}),
    ...(targetId ? { targetId } : {}),
  };
}

export const gardenMaps: Readonly<Record<GardenMapId, WorldMap>> = {
  village: {
    id: mapId('village'),
    bounds: { minX: -8, maxX: 8, minZ: -7, maxZ: 7 },
    spawnAnchorId: anchorId('village-square'),
    cameraZoom: 1,
  },
  garden: {
    id: mapId('garden'),
    bounds: { minX: -8, maxX: 8, minZ: -7, maxZ: 7 },
    spawnAnchorId: anchorId('garden-village-gate'),
    cameraZoom: 1,
  },
};

const villageAnchors: readonly GardenAnchor[] = [
  anchor('village-square', 'village', 0, 2),
  anchor('village-fountain', 'village', -4, 0, 'fountain'),
  anchor('village-market', 'village', 3, 0, 'market'),
  anchor('village-basket', 'village', 4, -3, 'seed-basket'),
  anchor('village-gardener', 'village', -2, -4, 'gardener'),
  anchor('village-traveler', 'village', 2, -4, 'traveler'),
  anchor('village-garden-gate', 'village', 0, 5, 'garden-gate'),
];

const gardenAnchors: readonly GardenAnchor[] = [
  anchor('garden-village-gate', 'garden', 0, 5, 'village-gate'),
  anchor('garden-bed', 'garden', -4, 0, 'planting-bed'),
  anchor('garden-clue', 'garden', 3, -1, 'clue-stone'),
  anchor('garden-lantern', 'garden', 4, 2, 'ancient-lantern'),
  anchor('garden-bench', 'garden', 0, -4, 'recap-bench'),
];

const edge = (from: string, to: string): Edge => ({
  from: anchorId(from),
  to: anchorId(to),
});

export const gardenGraphs: Readonly<Record<GardenMapId, GraphSource<GardenAnchor>>> = {
  village: {
    anchors: villageAnchors,
    edges: [
      edge('village-square', 'village-fountain'),
      edge('village-square', 'village-market'),
      edge('village-square', 'village-gardener'),
      edge('village-square', 'village-garden-gate'),
      edge('village-market', 'village-basket'),
      edge('village-market', 'village-traveler'),
      edge('village-gardener', 'village-traveler'),
      edge('village-traveler', 'village-basket'),
      edge('village-basket', 'village-garden-gate'),
    ],
  },
  garden: {
    anchors: gardenAnchors,
    edges: [
      edge('garden-village-gate', 'garden-bed'),
      edge('garden-village-gate', 'garden-clue'),
      edge('garden-village-gate', 'garden-bench'),
      edge('garden-clue', 'garden-lantern'),
      edge('garden-lantern', 'garden-bench'),
      edge('garden-bed', 'garden-bench'),
    ],
  },
};

export const gardenTargets: readonly GardenTarget[] = [
  {
    id: 'fountain',
    mapId: 'village',
    anchorId: anchorId('village-fountain'),
    kind: 'fountain',
    position: [-4, 0, -1],
  },
  {
    id: 'market',
    mapId: 'village',
    anchorId: anchorId('village-market'),
    kind: 'market',
    position: [3, 0, -2],
  },
  {
    id: 'seed-basket',
    mapId: 'village',
    anchorId: anchorId('village-basket'),
    kind: 'basket',
    position: [4.7, 0, -4],
  },
  {
    id: 'gardener',
    mapId: 'village',
    anchorId: anchorId('village-gardener'),
    kind: 'gardener',
    position: [-2.8, 0, -5.2],
  },
  {
    id: 'traveler',
    mapId: 'village',
    anchorId: anchorId('village-traveler'),
    kind: 'traveler',
    position: [2.8, 0, -5.2],
  },
  {
    id: 'garden-gate',
    mapId: 'village',
    anchorId: anchorId('village-garden-gate'),
    kind: 'gate',
    position: [0, 0, 6.4],
  },
  {
    id: 'village-gate',
    mapId: 'garden',
    anchorId: anchorId('garden-village-gate'),
    kind: 'gate',
    position: [0, 0, 6.4],
  },
  {
    id: 'planting-bed',
    mapId: 'garden',
    anchorId: anchorId('garden-bed'),
    kind: 'bed',
    position: [-4, 0, -1],
  },
  {
    id: 'clue-stone',
    mapId: 'garden',
    anchorId: anchorId('garden-clue'),
    kind: 'stone',
    position: [3, 0, -2],
  },
  {
    id: 'ancient-lantern',
    mapId: 'garden',
    anchorId: anchorId('garden-lantern'),
    kind: 'lantern',
    position: [4.5, 0, 3],
  },
  {
    id: 'recap-bench',
    mapId: 'garden',
    anchorId: anchorId('garden-bench'),
    kind: 'bench',
    position: [0, 0, -5.5],
  },
];

export const mapTransitions: readonly MapTransition[] = [
  {
    id: 'transition-to-garden' as TransitionId,
    fromMap: gardenMaps.village.id,
    fromAnchor: anchorId('village-garden-gate'),
    toMap: gardenMaps.garden.id,
    toAnchor: gardenMaps.garden.spawnAnchorId,
  },
  {
    id: 'transition-to-village' as TransitionId,
    fromMap: gardenMaps.garden.id,
    fromAnchor: gardenMaps.garden.spawnAnchorId,
    toMap: gardenMaps.village.id,
    toAnchor: anchorId('village-garden-gate'),
  },
];

export function getGardenTarget(id: string): GardenTarget | null {
  return gardenTargets.find((target) => target.id === id) ?? null;
}

export function gardenMapName(id: string): GardenMapId | null {
  if (id === 'map-village') return 'village';
  if (id === 'map-garden') return 'garden';
  return null;
}
