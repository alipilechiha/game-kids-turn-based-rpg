import type { SceneResource } from '../scene-host.js';
import { createSceneRegistry } from '../scene-host.js';
import {
  courtyardGraph,
  courtyardMap,
  sceneTransitions,
  workshopGraph,
  workshopMap,
} from '../scene-data.js';
import { disposeCourtyardResources, disposeWorkshopResources } from './scene-resources.js';

async function loadCourtyard(signal: AbortSignal): Promise<SceneResource> {
  if (signal.aborted) throw new DOMException('Scene load cancelled.', 'AbortError');
  const scene = await import('./CourtyardScene.tsx');
  return { Component: scene.CourtyardScene, dispose: disposeCourtyardResources };
}

async function loadWorkshop(signal: AbortSignal): Promise<SceneResource> {
  if (signal.aborted) throw new DOMException('Scene load cancelled.', 'AbortError');
  const scene = await import('./WorkshopScene.tsx');
  return { Component: scene.WorkshopScene, dispose: disposeWorkshopResources };
}

export const sceneRegistry = createSceneRegistry(
  [
    {
      map: courtyardMap,
      graph: courtyardGraph,
      camera: { kind: 'perspective' },
      load: loadCourtyard,
    },
    {
      map: workshopMap,
      graph: workshopGraph,
      camera: { kind: 'orthographic' },
      load: loadWorkshop,
    },
  ],
  sceneTransitions,
);
