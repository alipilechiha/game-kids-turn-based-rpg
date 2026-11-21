import { createGameRuntime, type GameRuntime } from 'waypoint-rpg-core';

export interface DemoState {
  readonly lampLit: boolean;
}

export type DemoCommand = { readonly type: 'TOGGLE_LAMP' };

export type DemoRuntime = GameRuntime<DemoState, DemoCommand> & {
  getSubscriberCount(): number;
};

export function createDemoRuntime(): DemoRuntime {
  const store = createGameRuntime<DemoState, DemoCommand>({
    createInitialState: () => ({ lampLit: false }),
    reducer: (state, command) =>
      command.type === 'TOGGLE_LAMP' ? { ...state, lampLit: !state.lampLit } : state,
  });
  const releases = new Set<() => void>();

  const subscribe: DemoRuntime['subscribe'] = (listener) => {
    const unsubscribeStore = store.subscribe(listener);
    let active = true;
    const release = () => {
      if (!active) return;
      active = false;
      unsubscribeStore();
      releases.delete(release);
    };
    releases.add(release);
    return release;
  };

  return {
    getState: () => store.getState(),
    dispatch: (command) => store.dispatch(command),
    subscribe,
    pause: () => store.pause(),
    resume: () => store.resume(),
    get paused() {
      return store.paused;
    },
    dispose: () => {
      for (const release of [...releases]) release();
      store.dispose();
    },
    getSubscriberCount: () => releases.size,
  };
}
