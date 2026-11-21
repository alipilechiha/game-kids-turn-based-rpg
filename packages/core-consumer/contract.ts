import { createGameRuntime } from 'waypoint-rpg-core';
import type {
  Anchor,
  AnchorId,
  AreaId,
  DiscoveryId,
  Edge,
  GameRuntime,
  GraphSource,
  LandmarkId,
  LoadResult,
  MapId,
  MapTransition,
  NpcId,
  NpcPlacement,
  PersistenceAdapter,
  PersistenceFailure,
  SaveScope,
  StorageFallback,
  TransitionId,
  WorldArea,
  WorldMap,
} from 'waypoint-rpg-core';

type State = { readonly count: number };
type Command =
  | { readonly kind: 'restore'; readonly data: State }
  | { readonly kind: 'empty-slot'; readonly slotKey: string }
  | { readonly kind: 'corrupt-slot'; readonly slotKey: string };

const runtime: GameRuntime<State, Command> = createGameRuntime<State, Command>(
  {
    createInitialState: () => ({ count: 0 }),
    reducer: (state, command) =>
      command.kind === 'restore' ? command.data : { count: state.count },
  },
  { clock: () => 1_700_000_000_000 },
);

const persistence: PersistenceAdapter<State> = {
  async load(scope: SaveScope): Promise<LoadResult<State>> {
    return scope.slotKey === 'corrupt' ? { kind: 'corrupt', reason: 'fixture' } : { kind: 'empty' };
  },
  async save(_data, _scope) {},
  onFailure(failure: PersistenceFailure): StorageFallback {
    return failure.kind === 'unavailable'
      ? { kind: 'memory', authoritative: false }
      : { kind: 'none' };
  },
};

/** Restore dispatch policy belongs to the consumer's reducer and commands. */
export async function restoreSlot(scope: SaveScope): Promise<LoadResult<State>> {
  const result = await persistence.load(scope);
  if (result.kind === 'loaded') runtime.dispatch({ kind: 'restore', data: result.data });
  else if (result.kind === 'empty')
    runtime.dispatch({ kind: 'empty-slot', slotKey: scope.slotKey });
  else runtime.dispatch({ kind: 'corrupt-slot', slotKey: scope.slotKey });
  return result;
}

const anchorA: Anchor = {
  id: 'anchor-a' satisfies AnchorId,
  x: 0,
  z: 0,
  walkable: true,
  areaId: 'area-hub' satisfies AreaId,
  mapId: 'map-hub' satisfies MapId,
  npcId: 'npc-guide' satisfies NpcId,
  landmarkId: null,
};
const anchorB: Anchor = {
  ...anchorA,
  id: 'anchor-b',
  x: 1,
  npcId: null,
  landmarkId: 'landmark-gate' satisfies LandmarkId,
};
const edge: Edge = {
  from: anchorA.id,
  to: anchorB.id,
  requiresDiscoveryId: 'discovery-bridge' satisfies DiscoveryId,
};
const graph: GraphSource = { anchors: [anchorA, anchorB], edges: [edge] };
const area: WorldArea = {
  id: 'area-hub',
  bounds: { minX: -1, maxX: 2, minZ: -1, maxZ: 2 },
  spawnAnchorId: anchorA.id,
};
const map: WorldMap = {
  id: 'map-hub',
  bounds: area.bounds,
  spawnAnchorId: anchorA.id,
  cameraZoom: 1.25,
  cameraPadding: 0.5,
};
const transition: MapTransition = {
  id: 'transition-door' satisfies TransitionId,
  fromMap: 'map-hub',
  fromAnchor: anchorB.id,
  toMap: 'map-room',
  toAnchor: 'anchor-room',
  discoveryId: 'discovery-door',
};
const npcPlacement: NpcPlacement = { npcId: 'npc-guide', anchorId: anchorA.id };

export const worldMetadata = { graph, area, map, transition, npcPlacement };

// @ts-expect-error package subpaths are deliberately not public API
import type { GraphSource as PrivateGraphSource } from 'waypoint-rpg-core/dist/graph.js';

export type ConsumerContract = {
  runtime: GameRuntime<State, Command>;
  graph: GraphSource;
  edge: Edge;
  area: WorldArea;
  map: WorldMap;
  transition: MapTransition;
  npcPlacement: NpcPlacement;
  privateGraphSource: PrivateGraphSource;
};
