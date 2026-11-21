export interface SceneProbe {
  frameCount: number;
  disposedScenes: number;
  runtimeSubscriptions: number;
  cameraKind: 'perspective' | 'orthographic' | 'unknown';
  cameraIsOrthographic: boolean;
  lampLit: boolean;
}

declare global {
  interface Window {
    __sceneProbe?: SceneProbe;
  }
}

export function sceneProbe(): SceneProbe | null {
  if (typeof window === 'undefined') return null;
  return (window.__sceneProbe ??= {
    frameCount: 0,
    disposedScenes: 0,
    runtimeSubscriptions: 0,
    cameraKind: 'unknown',
    cameraIsOrthographic: false,
    lampLit: false,
  });
}
