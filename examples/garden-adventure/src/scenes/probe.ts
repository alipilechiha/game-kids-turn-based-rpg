import type { GardenMapId } from '../world/world.js';

export interface GardenScreenPoint {
  readonly x: number;
  readonly y: number;
}

export interface GardenSceneProbe {
  readonly activeMap: GardenMapId;
  readonly cameraKind: 'orthographic' | 'unknown';
  readonly visibleMeshCount: number;
  readonly frameCount: number;
  readonly cleanupCount: number;
  readonly targetPoints: Readonly<Record<string, GardenScreenPoint>>;
  readonly renderedConsequences: readonly ('grown-tree' | 'lit-lantern')[];
}

declare global {
  interface Window {
    __gardenProbe?: GardenSceneProbe;
  }
}

export function currentGardenProbe(): GardenSceneProbe | undefined {
  return window.__gardenProbe;
}
