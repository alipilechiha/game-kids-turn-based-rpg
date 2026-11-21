import {
  createNarrativeState,
  transitionNarrative,
  type NarrativeCommand,
  type NarrativeState,
} from 'waypoint-rpg-narrative';
import { describe, expect, it, vi } from 'vitest';
import { bloodLeafNarrative } from './content/blood-leaf.js';
import { DEMO_SAVE_KEY, encodeDemoSave, type DemoStorage } from './persistence.js';
import { createDemoRuntime, type DemoSceneHost } from './runtime.js';
import type { RegisteredScene, SceneHostSnapshot } from './scene-host.js';

function fakeHost() {
  const saved = {
    value: null as string | null,
    failRead: false,
    failWrite: false,
    failRemove: false,
  };
  const storage: DemoStorage = {
    getItem: vi.fn(() => {
      if (saved.failRead) throw new Error('storage unavailable');
      return saved.value;
    }),
    setItem: vi.fn((_key, value) => {
      if (saved.failWrite) throw new Error('storage write unavailable');
      saved.value = value;
    }),
    removeItem: vi.fn(() => {
      if (saved.failRemove) throw new Error('storage remove unavailable');
      saved.value = null;
    }),
  };
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
    start: vi.fn(async (mapId, requestedAnchorId) => {
      const anchorId =
        requestedAnchorId ??
        (mapId === 'map-courtyard' ? 'anchor-courtyard-start' : 'anchor-workshop-door');
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
  return { host, activeScene, storage, saved };
}

function makeTruthBranch(): NarrativeState {
  let state = createNarrativeState(bloodLeafNarrative, 'restored-playthrough');
  const apply = (command: NarrativeCommand) => {
    const result = transitionNarrative(bloodLeafNarrative, state, {
      ...command,
      expectedRevision: state.revision,
    });
    if (!result.accepted) throw new Error(result.reason.message);
    state = result.state;
  };
  apply({
    type: 'open-dialogue',
    dialogueId: 'guardian-dialogue',
    playthroughId: state.playthroughId,
    expectedRevision: state.revision,
  });
  apply({
    type: 'choose',
    choiceId: 'seek-truth',
    playthroughId: state.playthroughId,
    expectedRevision: state.revision,
  });
  apply({
    type: 'exit-dialogue',
    playthroughId: state.playthroughId,
    expectedRevision: state.revision,
  });
  return state;
}

describe('demo application command boundary', () => {
  it('rejects before startup with distinct feedback tokens and no durable mutation', () => {
    const { host, storage } = fakeHost();
    const runtime = createDemoRuntime(host, { storage });
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
    const { host, storage } = fakeHost();
    const runtime = createDemoRuntime(host, { storage });
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
    const { host, storage } = fakeHost();
    const runtime = createDemoRuntime(host, { storage });
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
    const { host, storage } = fakeHost();
    await host.start('map-courtyard');
    vi.mocked(host.transition).mockResolvedValue({ status: 'failed', error: 'load failed' });
    const runtime = createDemoRuntime(host, { storage });
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

  it('validates stored state before hydration and restores its committed map and anchor', async () => {
    const { host, storage, saved } = fakeHost();
    saved.value = encodeDemoSave({
      contentVersion: 'older-copy-version',
      mapId: 'map-workshop',
      entryAnchorId: 'anchor-workshop-lamp',
      narrative: makeTruthBranch(),
    });
    const runtime = createDemoRuntime(host, { storage });

    const result = await runtime.start();

    expect(result.accepted).toBe(true);
    expect(host.start).toHaveBeenCalledOnce();
    expect(host.start).toHaveBeenCalledWith('map-workshop', 'anchor-workshop-lamp');
    expect(runtime.getDurableState()).toMatchObject({
      ready: true,
      mapId: 'map-workshop',
      anchorId: 'anchor-workshop-lamp',
      narrative: { playthroughId: 'restored-playthrough', revision: 3 },
    });
    expect(storage.setItem).not.toHaveBeenCalled();
    runtime.dispose();
  });

  it('preserves the original save when scene restoration fails', async () => {
    const { host, storage, saved } = fakeHost();
    const originalBytes = encodeDemoSave({
      contentVersion: 'saved-copy',
      mapId: 'map-workshop',
      entryAnchorId: 'anchor-workshop-lamp',
      narrative: makeTruthBranch(),
    });
    saved.value = originalBytes;
    vi.mocked(host.start).mockResolvedValueOnce({ status: 'failed', error: 'asset load failed' });
    const runtime = createDemoRuntime(host, { storage });

    const result = await runtime.start();

    expect(result.accepted).toBe(false);
    expect(runtime.getDurableState()).toMatchObject({ ready: false, sessionValid: false });
    expect(runtime.getState().bootstrap.status).toBe('recovery-required');
    expect(saved.value).toBe(originalBytes);
    expect(storage.setItem).not.toHaveBeenCalled();
    runtime.dispose();
  });

  it('does not autosave fresh initial state and saves only after an accepted durable command', async () => {
    const { host, storage } = fakeHost();
    const runtime = createDemoRuntime(host, { storage });
    await runtime.start();

    expect(storage.setItem).not.toHaveBeenCalled();
    const rejected = runtime.dispatch({ type: 'EXIT_DIALOGUE' });
    expect(rejected.accepted).toBe(false);
    expect(storage.setItem).not.toHaveBeenCalled();

    expect(
      runtime.dispatch({ type: 'OPEN_DIALOGUE', dialogueId: 'guardian-dialogue' }).accepted,
    ).toBe(true);
    expect(storage.setItem).toHaveBeenCalledOnce();
    expect(storage.setItem).toHaveBeenCalledWith(DEMO_SAVE_KEY, expect.any(String));
    runtime.dispose();
  });

  it('keeps corrupt stored bytes unchanged until explicit session-only recovery', async () => {
    const { host, storage, saved } = fakeHost();
    saved.value = '{not-json';
    const originalBytes = saved.value;
    const runtime = createDemoRuntime(host, { storage });

    const blocked = await runtime.start();
    expect(blocked.accepted).toBe(false);
    expect(runtime.getState().bootstrap.status).toBe('recovery-required');
    expect(host.start).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();

    expect((await runtime.recoverFreshSession()).accepted).toBe(true);
    expect(runtime.getState().bootstrap).toMatchObject({
      status: 'ready',
      storageMode: 'session-only',
    });
    expect(
      runtime.dispatch({ type: 'OPEN_DIALOGUE', dialogueId: 'guardian-dialogue' }).accepted,
    ).toBe(true);
    expect(saved.value).toBe(originalBytes);
    expect(storage.setItem).not.toHaveBeenCalled();
    runtime.dispose();
  });

  it('starts session-only when storage is unavailable and does not attempt autosave', async () => {
    const { host, storage, saved } = fakeHost();
    saved.failRead = true;
    const runtime = createDemoRuntime(host, { storage });

    expect((await runtime.start()).accepted).toBe(true);
    expect(runtime.getState().bootstrap.storageMode).toBe('session-only');
    expect(
      runtime.dispatch({ type: 'OPEN_DIALOGUE', dialogueId: 'guardian-dialogue' }).accepted,
    ).toBe(true);
    expect(storage.setItem).not.toHaveBeenCalled();
    runtime.dispose();
  });

  it('keeps original bytes and disables autosave after a confirmed reset cannot clear storage', async () => {
    const { host, storage, saved } = fakeHost();
    const originalBytes = encodeDemoSave({
      contentVersion: 'saved-copy',
      mapId: 'map-workshop',
      entryAnchorId: 'anchor-workshop-door',
      narrative: makeTruthBranch(),
    });
    saved.value = originalBytes;
    const runtime = createDemoRuntime(host, { storage, createPlaythroughId: () => 'reset-story' });
    await runtime.start();
    saved.failRemove = true;

    const unconfirmed = await runtime.resetPlaythrough(false);
    expect(unconfirmed.accepted).toBe(false);
    expect(host.start).toHaveBeenCalledOnce();
    expect(saved.value).toBe(originalBytes);

    const reset = await runtime.resetPlaythrough(true);
    expect(reset.accepted).toBe(true);
    expect(runtime.getDurableState()).toMatchObject({
      ready: true,
      sessionValid: true,
      mapId: 'map-courtyard',
      anchorId: 'anchor-courtyard-start',
      narrative: { playthroughId: 'reset-story', revision: 0 },
    });
    expect(runtime.getState().bootstrap.storageMode).toBe('session-only');
    expect(saved.value).toBe(originalBytes);

    expect(
      runtime.dispatch({ type: 'OPEN_DIALOGUE', dialogueId: 'guardian-dialogue' }).accepted,
    ).toBe(true);
    expect(saved.value).toBe(originalBytes);
    expect(storage.setItem).not.toHaveBeenCalled();
    runtime.dispose();
  });

  it('invalidates a pending old-playthrough transition before reset and ignores its late result', async () => {
    const { host, storage, saved } = fakeHost();
    const runtime = createDemoRuntime(host, { storage, createPlaythroughId: () => 'new-story' });
    await runtime.start();
    runtime.dispatch({ type: 'OPEN_DIALOGUE', dialogueId: 'guardian-dialogue' });
    runtime.dispatch({ type: 'CHOOSE', choiceId: 'seek-truth' });
    runtime.dispatch({ type: 'EXIT_DIALOGUE' });
    let resolveLate!: (result: { status: 'committed' }) => void;
    vi.mocked(host.transition).mockImplementationOnce(
      () => new Promise((resolve) => (resolveLate = resolve)),
    );

    const staleTransition = runtime.transitionTo('transition-to-workshop');
    const reset = await runtime.resetPlaythrough(true);
    expect(reset.accepted).toBe(true);
    expect(
      runtime.dispatch({ type: 'OPEN_DIALOGUE', dialogueId: 'guardian-dialogue' }).accepted,
    ).toBe(true);
    const resetSnapshot = runtime.getDurableState();
    expect(resetSnapshot.narrative.playthroughId).toBe('new-story');
    const resetBytes = saved.value;

    resolveLate({ status: 'committed' });
    expect((await staleTransition).accepted).toBe(false);
    expect(runtime.getDurableState()).toBe(resetSnapshot);
    expect(runtime.getDurableState().mapId).toBe('map-courtyard');
    expect(saved.value).toBe(resetBytes);
    expect(saved.value).toContain('new-story');
    runtime.dispose();
  });

  it('does not let a direct reset bypass an active modal dialogue', async () => {
    const { host, storage } = fakeHost();
    const runtime = createDemoRuntime(host, { storage });
    await runtime.start();
    runtime.dispatch({ type: 'OPEN_DIALOGUE', dialogueId: 'guardian-dialogue' });
    const before = runtime.getDurableState();

    const result = await runtime.resetPlaythrough(true);

    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('dialogue-active');
    expect(host.start).toHaveBeenCalledOnce();
    expect(runtime.getDurableState()).toBe(before);
    runtime.dispose();
  });
});
