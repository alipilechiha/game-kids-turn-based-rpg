import { sceneProbe } from '../probe.js';

function recordSceneDisposal(): void {
  const probe = sceneProbe();
  if (probe) probe.disposedScenes += 1;
}

export const disposeCourtyardResources = recordSceneDisposal;
export const disposeWorkshopResources = recordSceneDisposal;
