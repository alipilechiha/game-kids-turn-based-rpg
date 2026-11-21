import { describe, expect, it, vi } from 'vitest';
import { createDemoRuntime } from './runtime.js';

describe('demo game runtime', () => {
  it('projects a lantern fact and releases scene subscriptions', () => {
    const runtime = createDemoRuntime();
    const listener = vi.fn();
    const unsubscribe = runtime.subscribe(listener);

    expect(runtime.getState().lampLit).toBe(false);
    expect(runtime.getSubscriberCount()).toBe(1);

    runtime.dispatch({ type: 'TOGGLE_LAMP' });
    expect(runtime.getState().lampLit).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    expect(runtime.getSubscriberCount()).toBe(0);
    runtime.dispatch({ type: 'TOGGLE_LAMP' });
    expect(listener).toHaveBeenCalledTimes(1);

    runtime.dispose();
  });
});
