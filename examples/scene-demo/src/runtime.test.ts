import { describe, expect, it, vi } from 'vitest';
import { createDemoRuntime, type DemoSceneHost } from './runtime.js';
import type { RegisteredScene, SceneHostSnapshot } from './scene-host.js';

function fakeHost() {
  let snapshot: SceneHostSnapshot = {
    active: null,
    pendingMapId: null,
    currentAnchorId: null,
    error: null,
  };
  const activeScene = (mapId: string, anchorId: string): RegisteredScene =>
    ({
      definition: { map: { id: mapId } },
      resource: { Component: (() => null) as never, dispose() {} },
      entryAnchorId: anchorId,
    }) as unknown as RegisteredScene;
  const host: DemoSceneHost = {
    getSnapshot: () => snapshot,
    start: vi.fn(async (mapId) => {
      const anchorId =
        mapId === 'map-courtyard' ? 'anchor-courtyard-start' : 'anchor-workshop-door';
      snapshot = {
        active: activeScene(mapId, anchorId),
        pendingMapId: null,
        currentAnchorId: anchorId,
        error: null,
      };
      return { status: 'committed' } as const;
    }),
    transition: vi.fn(async (transitionId) => {
      const destination =
        transitionId === 'transition-to-workshop' ? 'map-workshop' : 'map-courtyard';
      const anchorId =
        destination === 'map-workshop' ? 'anchor-workshop-door' : 'anchor-courtyard-door';
      snapshot = {
        active: activeScene(destination, anchorId),
        pendingMapId: null,
        currentAnchorId: anchorId,
        error: null,
      };
      return { status: 'committed' } as const;
    }),
  };
  return { host, activeScene };
}

describe('demo application command boundary', () => {
  it('rejects before startup with distinct feedback tokens and no durable mutation', () => {
    const { host } = fakeHost();
    const runtime = createDemoRuntime(host);
    const durable = runtime.getDurableState();

    const first = runtime.dispatch({ type: 'OPEN_DIALOGUE', dialogueId: 'guardian-dialogue' });
    const second = runtime.dispatch({ type: 'ADVANCE' });

    expect(first.accepted).toBe(false);
    expect(first.reason).toBe('not-ready');
    expect(second.accepted).toBe(false);
    expect(second.reason).toBe('not-ready');
    expect(first.token).not.toBe(second.token);
    expect(runtime.getDurableState()).toBe(durable);
    expect(runtime.getDurableState().narrative.revision).toBe(0);
    expect(host.start).not.toHaveBeenCalled();
    runtime.dispose();
  });

  it('enforces map and modal eligibility even when commands are dispatched directly', async () => {
    const { host } = fakeHost();
    const runtime = createDemoRuntime(host);
    await runtime.start();

    const lockedRoute = await runtime.transitionTo('transition-to-workshop');
    expect(lockedRoute.accepted).toBe(false);
    expect(lockedRoute.reason).toBe('scene-condition');
    expect(host.transition).not.toHaveBeenCalled();

    const opened = runtime.dispatch({ type: 'OPEN_DIALOGUE', dialogueId: 'guardian-dialogue' });
    expect(opened.accepted).toBe(true);
    const durableDuringDialogue = runtime.getDurableState();
    const blockedRoute = await runtime.transitionTo('transition-to-workshop');
    const blockedTrigger = runtime.dispatch({
      type: 'TRIGGER',
      triggerId: 'light-workshop-lantern',
    });
    expect(blockedRoute.accepted).toBe(false);
    expect(blockedRoute.reason).toBe('dialogue-active');
    expect(blockedTrigger.accepted).toBe(false);
    expect(blockedTrigger.reason).toBe('dialogue-active');
    expect(runtime.getDurableState()).toBe(durableDuringDialogue);
    expect(host.transition).not.toHaveBeenCalled();

    expect(runtime.dispatch({ type: 'CHOOSE', choiceId: 'seek-truth' }).accepted).toBe(true);
    expect(runtime.dispatch({ type: 'EXIT_DIALOGUE' }).accepted).toBe(true);
    const moved = await runtime.transitionTo('transition-to-workshop');
    expect(moved.accepted).toBe(true);
    expect(runtime.getDurableState().mapId).toBe('map-workshop');
    const wrongMapDialogue = runtime.dispatch({
      type: 'OPEN_DIALOGUE',
      dialogueId: 'guardian-dialogue',
    });
    expect(wrongMapDialogue.accepted).toBe(false);
    expect(wrongMapDialogue.reason).toBe('scene-ineligible');
    expect(
      runtime.dispatch({ type: 'TRIGGER', triggerId: 'light-workshop-lantern' }).accepted,
    ).toBe(true);
    expect(runtime.getDurableState().narrative.facts['lantern-lit']).toBe(true);

    await runtime.transitionTo('transition-to-courtyard');
    const resumed = runtime.dispatch({ type: 'OPEN_DIALOGUE', dialogueId: 'guardian-dialogue' });
    expect(resumed.accepted).toBe(true);
    expect(runtime.getDurableState().narrative.activeDialogue?.nodeId).toBe('truth-response');
    runtime.dispose();
  });

  it('checks authored trigger conditions even when the caller bypasses the disabled control', async () => {
    const { host } = fakeHost();
    const runtime = createDemoRuntime(host);
    await runtime.start();
    runtime.dispatch({ type: 'OPEN_DIALOGUE', dialogueId: 'guardian-dialogue' });
    runtime.dispatch({ type: 'CHOOSE', choiceId: 'seek-vengeance' });
    runtime.dispatch({ type: 'EXIT_DIALOGUE' });
    await runtime.transitionTo('transition-to-workshop');
    const durable = runtime.getDurableState();

    const result = runtime.dispatch({ type: 'TRIGGER', triggerId: 'light-workshop-lantern' });

    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('trigger-unavailable');
    expect(runtime.getDurableState()).toBe(durable);
    expect(runtime.getDurableState().narrative.revision).toBe(durable.narrative.revision);
    runtime.dispose();
  });

  it('does not commit a requested map when the scene host fails to load it', async () => {
    const { host } = fakeHost();
    await host.start('map-courtyard');
    vi.mocked(host.transition).mockResolvedValue({ status: 'failed', error: 'load failed' });
    const runtime = createDemoRuntime(host);
    await runtime.start();
    runtime.dispatch({ type: 'OPEN_DIALOGUE', dialogueId: 'guardian-dialogue' });
    runtime.dispatch({ type: 'CHOOSE', choiceId: 'seek-truth' });
    runtime.dispatch({ type: 'EXIT_DIALOGUE' });
    const before = runtime.getDurableState();

    const result = await runtime.transitionTo('transition-to-workshop');

    expect(result.accepted).toBe(false);
    expect(runtime.getDurableState()).toBe(before);
    expect(runtime.getDurableState().mapId).toBe('map-courtyard');
    runtime.dispose();
  });
});
