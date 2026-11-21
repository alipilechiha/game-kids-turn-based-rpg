import { useCallback, useSyncExternalStore } from 'react';
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
  const state = useSyncExternalStore(subscribe, runtime.getState, runtime.getState);
  const probe = sceneProbe();
  if (probe) probe.lampLit = state.lampLit;
  return state;
}
