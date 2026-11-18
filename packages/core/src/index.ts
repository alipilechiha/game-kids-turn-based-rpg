export type {
  AnchorId,
  AreaId,
  DiscoveryId,
  LandmarkId,
  MapId,
  NpcId,
  TransitionId,
} from './identifiers.js';

export type {
  Anchor,
  Bounds,
  Edge,
  MapTransition,
  NpcPlacement,
  WorldArea,
  WorldMap,
} from './world.js';

export { insideBounds } from './geometry.js';

export {
  anchorForLandmark,
  anchorForNpc,
  distanceBetween,
  getAnchor,
  getAnchorOrNull,
  neighboursOf,
} from './graph.js';
export type { GraphSource } from './graph.js';

export { findPath, nearestWalkableAnchor, pathToPoints } from './pathfinding.js';
export type { PathPoint } from './pathfinding.js';

export type {
  GameRuntime,
  GameRuntimeAdapter,
  GameRuntimeConfig,
  ReducerContext,
  RuntimeListener,
} from './runtime.js';
export { createGameRuntime } from './runtime.js';

export type {
  LoadResult,
  PersistenceAdapter,
  PersistenceFailure,
  SaveScope,
  StorageFallback,
} from './persistence.js';
