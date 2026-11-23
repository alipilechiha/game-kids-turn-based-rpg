import type { GardenMapId } from '../world/world.js';

export interface GardenScreenPoint {
  readonly x: number;
  readonly y: number;
}

export interface GardenWorldPoint {
  readonly x: number;
  readonly z: number;
}

export interface GardenSceneProbe {
  readonly activeMap: GardenMapId;
  readonly activeAnchor: string;
  readonly playthroughId: string;
  readonly cameraKind: 'orthographic' | 'unknown';
  readonly visibleMeshCount: number;
  readonly frameCount: number;
  readonly cleanupCount: number;
  readonly playerPosition: GardenWorldPoint;
  readonly playerAtAnchor: boolean;
  readonly targetPoints: Readonly<Record<string, GardenScreenPoint>>;
  readonly renderedConsequences: readonly ('grown-tree' | 'lit-lantern')[];
}

export interface GardenSceneReadiness {
  readonly mapId: GardenMapId;
  readonly anchorId: string;
  readonly playthroughId: string;
  readonly cameraKind: GardenSceneProbe['cameraKind'];
  readonly frameCount: number;
  readonly visibleMeshCount: number;
  readonly playerAtAnchor: boolean;
}

declare global {
  interface Window {
    __gardenProbe?: GardenSceneProbe;
  }
}

export function currentGardenProbe(): GardenSceneProbe | undefined {
  return window.__gardenProbe;
}
