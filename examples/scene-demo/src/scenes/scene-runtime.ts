import { useCallback, useSyncExternalStore } from 'react';
import { getFact } from 'waypoint-rpg-narrative';
import type { DemoRuntime } from '../runtime.js';
import { sceneProbe } from '../probe.js';

export function subscribeDemoRuntime(runtime: DemoRuntime, listener: () => void): () => void {
  const unsubscribe = runtime.subscribe(listener);
  const probe = sceneProbe();
  if (probe) probe.runtimeSubscriptions = runtime.getSubscriberCount();

  return () => {
    unsubscribe();
    if (probe) probe.runtimeSubscriptions = runtime.getSubscriberCount();
  };
}

export function useDemoState(runtime: DemoRuntime) {
  const subscribe = useCallback(
    (listener: () => void) => subscribeDemoRuntime(runtime, listener),
    [runtime],
  );
  const state = useSyncExternalStore(subscribe, runtime.getDurableState, runtime.getDurableState);
  const probe = sceneProbe();
  if (probe) {
    probe.lampLit = getFact(state.narrative, 'lantern-lit') === true;
    probe.narrativeRevision = state.narrative.revision;
  }
  return state;
}
