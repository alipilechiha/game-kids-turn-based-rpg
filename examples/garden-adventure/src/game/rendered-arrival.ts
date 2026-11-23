import type { GardenRuntime, GardenState } from './runtime.js';

export interface RenderedArrival {
  readonly mapId: GardenState['mapId'];
  readonly committedAnchor: GardenState['anchorId'];
  readonly playthroughId: string;
  readonly routeId: string;
  readonly nextIndex: number;
  readonly targetAnchor: GardenState['anchorId'];
}

/**
 * Commits a rendered waypoint only while the runtime still owns the exact
 * scene, playthrough, and route step that produced the presentation signal.
 */
export function commitRenderedArrival(runtime: GardenRuntime, arrival: RenderedArrival): boolean {
  const current = runtime.getState();
  if (
    current.phase !== 'playing' ||
    current.mapId !== arrival.mapId ||
    current.anchorId !== arrival.committedAnchor ||
    current.narrative.playthroughId !== arrival.playthroughId ||
    current.walk?.routeId !== arrival.routeId ||
    current.walk.nextIndex !== arrival.nextIndex ||
    current.walk.path[current.walk.nextIndex] !== arrival.targetAnchor
  ) {
    return false;
  }

  const next = runtime.dispatch({
    type: 'ARRIVE',
    routeId: arrival.routeId,
    anchorId: arrival.targetAnchor,
  });
  return next !== current && next.anchorId === arrival.targetAnchor;
}
