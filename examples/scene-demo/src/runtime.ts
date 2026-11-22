import { createGameRuntime, type AnchorId, type MapId } from 'waypoint-rpg-core';
import {
  createNarrativeState,
  getFact,
  transitionNarrative,
  type NarrativeCommand,
  type NarrativeState,
} from 'waypoint-rpg-narrative';
import { bloodLeafDefinition, bloodLeafNarrative } from './content/blood-leaf.js';
import { sceneTransitions } from './scene-data.js';
import type { SceneHost } from './scene-host.js';
import {
  browserDemoStorage,
  decodeDemoSave,
  DEMO_SAVE_KEY,
  encodeDemoSave,
  type DemoStorage,
} from './persistence.js';

export type DemoSceneHost = Pick<SceneHost, 'getSnapshot' | 'start' | 'transition'>;

export type DemoNarrativeAction =
  | { readonly type: 'OPEN_DIALOGUE'; readonly dialogueId: string }
  | { readonly type: 'CHOOSE'; readonly choiceId: string }
  | { readonly type: 'ADVANCE' }
  | { readonly type: 'EXIT_DIALOGUE' }
  | { readonly type: 'CLOSE_DIALOGUE' }
  | { readonly type: 'FINISH' }
  | { readonly type: 'TRIGGER'; readonly triggerId: string };

export type DemoStorageMode = 'unknown' | 'persistent' | 'session-only';

export interface DemoBootstrapState {
  readonly status: 'starting' | 'ready' | 'recovery-required' | 'resetting';
  readonly storageMode: DemoStorageMode;
  readonly reason: string | null;
}

export interface DemoDurableState {
  readonly ready: boolean;
  readonly sessionValid: boolean;
  readonly sessionEpoch: number;
  readonly mapId: MapId | null;
  readonly anchorId: AnchorId | null;
  readonly narrative: NarrativeState;
}

export interface DemoFeedback {
  readonly token: string;
  readonly action: string;
  readonly accepted: boolean;
  readonly revision: number;
  readonly reason?: string;
}

export interface DemoSnapshot {
  /** Persistent gameplay state; rejected commands preserve this object's identity. */
  readonly durable: DemoDurableState;
  /** Startup and storage capability are transient and excluded from saved payloads. */
  readonly bootstrap: DemoBootstrapState;
  /** Transient per-command response, correlated by token and excluded from saved payloads. */
  readonly feedback: DemoFeedback | null;
}

export interface DemoRuntimeOptions {
  readonly storage?: DemoStorage;
  readonly createPlaythroughId?: () => string;
}

export interface DemoRuntime {
  getState(): DemoSnapshot;
  getDurableState(): DemoDurableState;
  subscribe(listener: () => void): () => void;
  /** Application command boundary; there is intentionally no raw store dispatch. */
  dispatch(action: DemoNarrativeAction): DemoFeedback;
  start(): Promise<DemoFeedback>;
  recoverFreshSession(): Promise<DemoFeedback>;
  resetPlaythrough(confirmed: boolean): Promise<DemoFeedback>;
  transitionTo(transitionId: (typeof sceneTransitions)[number]['id']): Promise<DemoFeedback>;
  pause(): void;
  resume(): void;
  dispose(): void;
  getSubscriberCount(): number;
}

type StoreCommand =
  | {
      readonly type: 'NARRATIVE_ACTION';
      readonly action: DemoNarrativeAction;
      readonly token: string;
    }
  | {
      readonly type: 'SCENE_COMMITTED';
      readonly token: string;
      readonly action: string;
      readonly mapId: MapId;
      readonly anchorId: AnchorId;
      readonly expectedEpoch: number;
    }
  | {
      readonly type: 'BOOTSTRAP_COMMITTED' | 'RESET_COMMITTED';
      readonly token: string;
      readonly action: string;
      readonly mapId: MapId;
      readonly anchorId: AnchorId;
      readonly narrative: NarrativeState;
      readonly expectedEpoch: number;
      readonly storageMode: Exclude<DemoStorageMode, 'unknown'>;
    }
  | {
      readonly type: 'RESET_BEGIN';
      readonly token: string;
      readonly expectedEpoch: number;
    }
  | { readonly type: 'BOOTSTRAP_STATUS'; readonly bootstrap: DemoBootstrapState }
  | {
      readonly type: 'REJECT';
      readonly token: string;
      readonly action: string;
      readonly reason: string;
    };

let playthroughSequence = 0;

function createPlaythroughId(): string {
  const nonce =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replaceAll('-', '')
      : `${Date.now().toString(36)}-${++playthroughSequence}`;
  return `blood-leaf-${nonce}`;
}

function feedback(
  token: string,
  action: string,
  accepted: boolean,
  revision: number,
  reason?: string,
): DemoFeedback {
  return Object.freeze({ token, action, accepted, revision, ...(reason ? { reason } : {}) });
}

function narrativeCommand(state: NarrativeState, action: DemoNarrativeAction): NarrativeCommand {
  const base = { playthroughId: state.playthroughId, expectedRevision: state.revision };
  switch (action.type) {
    case 'OPEN_DIALOGUE':
      return { ...base, type: 'open-dialogue', dialogueId: action.dialogueId };
    case 'CHOOSE':
      return { ...base, type: 'choose', choiceId: action.choiceId };
    case 'ADVANCE':
      return { ...base, type: 'advance' };
    case 'EXIT_DIALOGUE':
      return { ...base, type: 'exit-dialogue' };
    case 'CLOSE_DIALOGUE':
      return { ...base, type: 'close-dialogue' };
    case 'FINISH':
      return { ...base, type: 'finish' };
    case 'TRIGGER':
      return { ...base, type: 'trigger', triggerId: action.triggerId };
  }
}

export function getDialogueOwnerMap(dialogueId: string): MapId | null {
  if (dialogueId === 'guardian-dialogue' || dialogueId === 'truth-resolution-dialogue')
    return 'map-courtyard';
  if (dialogueId === 'workshop-clue-dialogue') return 'map-workshop';
  return null;
}

function actionName(action: DemoNarrativeAction): string {
  switch (action.type) {
    case 'OPEN_DIALOGUE':
      return `open:${action.dialogueId}`;
    case 'CHOOSE':
      return `choose:${action.choiceId}`;
    case 'TRIGGER':
      return `trigger:${action.triggerId}`;
    default:
      return action.type.toLowerCase();
  }
}

function eligibilityReason(
  state: DemoSnapshot,
  action: DemoNarrativeAction,
  host: DemoSceneHost,
  transitionPending: boolean,
): string | null {
  const durable = state.durable;
  if (!durable.ready || state.bootstrap.status !== 'ready') return 'not-ready';
  if (!durable.sessionValid) return 'session-invalidated';
  const hostSnapshot = host.getSnapshot();
  if (
    transitionPending ||
    hostSnapshot.pendingMapId !== null ||
    !hostSnapshot.active ||
    hostSnapshot.active.definition.map.id !== durable.mapId
  )
    return 'scene-pending';

  if (durable.narrative.activeDialogue) {
    if (getDialogueOwnerMap(durable.narrative.activeDialogue.dialogueId) !== durable.mapId)
      return 'scene-ineligible';
    if (
      action.type === 'ADVANCE' ||
      action.type === 'CHOOSE' ||
      action.type === 'EXIT_DIALOGUE' ||
      action.type === 'CLOSE_DIALOGUE' ||
      action.type === 'FINISH'
    )
      return null;
    return 'dialogue-active';
  }

  if (action.type === 'OPEN_DIALOGUE') {
    const owner = getDialogueOwnerMap(action.dialogueId);
    if (!owner || owner !== durable.mapId) return 'scene-ineligible';
    if (
      durable.narrative.suspendedDialogue &&
      durable.narrative.suspendedDialogue.dialogueId !== action.dialogueId
    )
      return 'dialogue-suspended';
    const facts = durable.narrative.facts;
    if (action.dialogueId === 'guardian-dialogue')
      return facts['seeking-truth'] === true || facts['seeking-vengeance'] === true
        ? durable.narrative.suspendedDialogue?.dialogueId === action.dialogueId
          ? null
          : 'scene-ineligible'
        : null;
    if (action.dialogueId === 'workshop-clue-dialogue')
      return facts['seeking-truth'] === true && facts['clue-resolved'] !== true
        ? null
        : 'scene-ineligible';
    if (action.dialogueId === 'truth-resolution-dialogue')
      return facts['seeking-truth'] === true && facts['clue-resolved'] === true
        ? null
        : 'scene-ineligible';
  }
  if (action.type === 'TRIGGER') return 'external-trigger-disabled';
  return 'no-active-dialogue';
}

function transitionReason(
  state: DemoSnapshot,
  transitionId: (typeof sceneTransitions)[number]['id'],
  host: DemoSceneHost,
  transitionPending: boolean,
): string | null {
  const durable = state.durable;
  if (!durable.ready || state.bootstrap.status !== 'ready') return 'not-ready';
  if (!durable.sessionValid) return 'session-invalidated';
  if (durable.narrative.activeDialogue) return 'dialogue-active';
  if (transitionPending) return 'scene-pending';
  const hostSnapshot = host.getSnapshot();
  if (
    hostSnapshot.pendingMapId !== null ||
    !hostSnapshot.active ||
    hostSnapshot.active.definition.map.id !== durable.mapId
  )
    return 'scene-pending';
  const route = sceneTransitions.find((candidate) => candidate.id === transitionId);
  if (!route || route.fromMap !== durable.mapId) return 'scene-ineligible';
  if (
    route.toMap === 'map-workshop' &&
    getFact(durable.narrative, 'seeking-truth') !== true &&
    getFact(durable.narrative, 'seeking-vengeance') !== true
  )
    return 'scene-condition';
  return null;
}

function reduceDemoState(
  state: DemoSnapshot,
  command: StoreCommand,
  host: DemoSceneHost,
  transitionPending: () => boolean,
): DemoSnapshot {
  if (command.type === 'REJECT')
    return {
      ...state,
      durable: state.durable,
      feedback: feedback(
        command.token,
        command.action,
        false,
        state.durable.narrative.revision,
        command.reason,
      ),
    };

  if (command.type === 'BOOTSTRAP_STATUS') return { ...state, bootstrap: command.bootstrap };

  if (command.type === 'RESET_BEGIN') {
    if (
      !state.durable.ready ||
      !state.durable.sessionValid ||
      command.expectedEpoch !== state.durable.sessionEpoch
    )
      return {
        ...state,
        feedback: feedback(
          command.token,
          'reset',
          false,
          state.durable.narrative.revision,
          'session-not-ready',
        ),
      };
    return {
      ...state,
      durable: Object.freeze({
        ...state.durable,
        ready: false,
        sessionValid: false,
        sessionEpoch: state.durable.sessionEpoch + 1,
        mapId: null,
        anchorId: null,
      }),
      bootstrap: {
        status: 'resetting',
        storageMode: state.bootstrap.storageMode,
        reason: null,
      },
      feedback: feedback(
        command.token,
        'reset',
        false,
        state.durable.narrative.revision,
        'resetting',
      ),
    };
  }

  if (command.type === 'NARRATIVE_ACTION') {
    const name = actionName(command.action);
    const blocked = eligibilityReason(state, command.action, host, transitionPending());
    if (blocked)
      return {
        ...state,
        durable: state.durable,
        feedback: feedback(command.token, name, false, state.durable.narrative.revision, blocked),
      };
    const result = transitionNarrative(
      bloodLeafNarrative,
      state.durable.narrative,
      narrativeCommand(state.durable.narrative, command.action),
    );
    if (!result.accepted)
      return {
        ...state,
        durable: state.durable,
        feedback: feedback(
          command.token,
          name,
          false,
          state.durable.narrative.revision,
          result.reason.code,
        ),
      };
    const durable = Object.freeze({ ...state.durable, narrative: result.state });
    return {
      ...state,
      durable,
      feedback: feedback(command.token, name, true, result.state.revision),
    };
  }

  if (command.type === 'BOOTSTRAP_COMMITTED' || command.type === 'RESET_COMMITTED') {
    const active = host.getSnapshot().active;
    const isInitial = command.type === 'BOOTSTRAP_COMMITTED';
    const validCommit =
      command.expectedEpoch === state.durable.sessionEpoch &&
      !state.durable.ready &&
      !state.durable.sessionValid &&
      active?.definition.map.id === command.mapId &&
      host.getSnapshot().pendingMapId === null &&
      host.getSnapshot().currentAnchorId === command.anchorId &&
      (isInitial || state.bootstrap.status === 'resetting');
    if (!validCommit)
      return {
        ...state,
        durable: state.durable,
        feedback: feedback(
          command.token,
          command.action,
          false,
          state.durable.narrative.revision,
          'scene-stale',
        ),
      };
    const durable = Object.freeze({
      ...state.durable,
      ready: true,
      sessionValid: true,
      mapId: command.mapId,
      anchorId: command.anchorId,
      narrative: command.narrative,
    });
    return {
      ...state,
      durable,
      bootstrap: { status: 'ready', storageMode: command.storageMode, reason: null },
      feedback: feedback(command.token, command.action, true, durable.narrative.revision),
    };
  }

  const active = host.getSnapshot().active;
  const validCommit =
    command.expectedEpoch === state.durable.sessionEpoch &&
    state.durable.ready &&
    state.durable.sessionValid &&
    !state.durable.narrative.activeDialogue &&
    active?.definition.map.id === command.mapId &&
    host.getSnapshot().pendingMapId === null &&
    host.getSnapshot().currentAnchorId === command.anchorId;
  if (!validCommit)
    return {
      ...state,
      durable: state.durable,
      feedback: feedback(
        command.token,
        command.action,
        false,
        state.durable.narrative.revision,
        'scene-stale',
      ),
    };
  const durable = Object.freeze({
    ...state.durable,
    mapId: command.mapId,
    anchorId: command.anchorId,
  });
  return {
    ...state,
    durable,
    feedback: feedback(command.token, command.action, true, durable.narrative.revision),
  };
}

export function createDemoRuntime(
  host: DemoSceneHost,
  options: DemoRuntimeOptions = {},
): DemoRuntime {
  let pendingTransitionToken: string | null = null;
  let disposed = false;
  let commandSequence = 0;
  let bootstrapTask: Promise<DemoFeedback> | null = null;
  let resetTask: Promise<DemoFeedback> | null = null;
  let storageMode: Exclude<DemoStorageMode, 'unknown'> = 'persistent';
  let persistenceArmed = false;
  const storage = options.storage ?? browserDemoStorage;
  const idFactory = options.createPlaythroughId ?? createPlaythroughId;
  const releases = new Set<() => void>();
  const createToken = (): string => `blood-leaf-command-${++commandSequence}`;
  const store = createGameRuntime<DemoSnapshot, StoreCommand>({
    createInitialState: () => ({
      durable: Object.freeze({
        ready: false,
        sessionValid: false,
        sessionEpoch: 0,
        mapId: null,
        anchorId: null,
        narrative: createNarrativeState(bloodLeafNarrative, 'blood-leaf-bootstrap'),
      }),
      bootstrap: { status: 'starting', storageMode: 'unknown', reason: null },
      feedback: null,
    }),
    reducer: (state, command) =>
      reduceDemoState(state, command, host, () => pendingTransitionToken !== null),
  });

  const setBootstrap = (bootstrap: DemoBootstrapState): void => {
    store.dispatch({ type: 'BOOTSTRAP_STATUS', bootstrap });
  };

  const persistCommittedDurable = (durable: DemoDurableState): void => {
    if (
      !persistenceArmed ||
      storageMode !== 'persistent' ||
      !durable.ready ||
      !durable.sessionValid ||
      !durable.mapId ||
      !durable.anchorId
    )
      return;
    try {
      storage.setItem(
        DEMO_SAVE_KEY,
        encodeDemoSave({
          contentVersion: bloodLeafDefinition.contentVersion,
          mapId: durable.mapId,
          entryAnchorId: durable.anchorId,
          narrative: durable.narrative,
        }),
      );
    } catch {
      persistenceArmed = false;
      storageMode = 'session-only';
      setBootstrap({
        status: 'ready',
        storageMode,
        reason: 'save-write-failed',
      });
    }
  };

  /** Persistence follows explicit durable identity changes, never notifications alone. */
  const dispatchCommitted = (command: StoreCommand): DemoSnapshot => {
    const before = store.getState().durable;
    store.dispatch(command);
    const state = store.getState();
    if (state.durable !== before) persistCommittedDurable(state.durable);
    return store.getState();
  };

  const reject = (action: string, reason: string, token = createToken()): DemoFeedback => {
    store.dispatch({ type: 'REJECT', token, action, reason });
    return store.getState().feedback!;
  };

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

  const commitLoadedSession = (
    action: string,
    narrative: NarrativeState,
    expectedEpoch: number,
    mode: Exclude<DemoStorageMode, 'unknown'>,
    token: string,
  ): DemoFeedback => {
    const snapshot = host.getSnapshot();
    const active = snapshot.active;
    if (!active || snapshot.pendingMapId !== null)
      return reject(action, 'scene-not-committed', token);
    const command: StoreCommand = {
      type: action === 'reset' ? 'RESET_COMMITTED' : 'BOOTSTRAP_COMMITTED',
      token,
      action,
      mapId: active.definition.map.id,
      anchorId: snapshot.currentAnchorId ?? active.entryAnchorId,
      narrative,
      expectedEpoch,
      storageMode: mode,
    };
    const result = dispatchCommitted(command).feedback!;
    if (result.accepted) {
      storageMode = mode;
      persistenceArmed = mode === 'persistent';
    }
    return result;
  };

  const loadFreshSession = async (
    action: 'start' | 'recover',
    mode: Exclude<DemoStorageMode, 'unknown'>,
    expectedEpoch: number,
    token: string,
  ): Promise<DemoFeedback> => {
    const narrative = createNarrativeState(bloodLeafNarrative, idFactory());
    const loaded = await host.start('map-courtyard');
    if (loaded.status !== 'committed') {
      setBootstrap({
        status: 'recovery-required',
        storageMode: mode,
        reason: `scene-${loaded.status}`,
      });
      return reject(action, `scene-${loaded.status}`, token);
    }
    return commitLoadedSession(action, narrative, expectedEpoch, mode, token);
  };

  const start: DemoRuntime['start'] = () => {
    if (bootstrapTask) return bootstrapTask;
    if (disposed) return Promise.resolve(reject('start', 'runtime-disposed'));
    const current = store.getState();
    if (current.durable.ready) return Promise.resolve(reject('start', 'already-ready'));
    if (current.bootstrap.status === 'recovery-required')
      return Promise.resolve(reject('start', 'recovery-required'));
    if (current.bootstrap.status === 'resetting')
      return Promise.resolve(reject('start', 'reset-in-progress'));
    const token = createToken();
    const expectedEpoch = current.durable.sessionEpoch;
    setBootstrap({ status: 'starting', storageMode: 'unknown', reason: null });
    const task = (async () => {
      let raw: string | null;
      try {
        raw = storage.getItem(DEMO_SAVE_KEY);
      } catch {
        storageMode = 'session-only';
        return loadFreshSession('start', storageMode, expectedEpoch, token);
      }

      if (raw === null) {
        storageMode = 'persistent';
        return loadFreshSession('start', storageMode, expectedEpoch, token);
      }

      const decoded = decodeDemoSave(raw);
      if (!decoded.ok) {
        storageMode = 'persistent';
        setBootstrap({
          status: 'recovery-required',
          storageMode,
          reason: `${decoded.kind}:${decoded.message}`,
        });
        return reject('start', `save-${decoded.kind}`, token);
      }

      const loaded = await host.start(decoded.value.mapId, decoded.value.entryAnchorId);
      if (loaded.status !== 'committed') {
        storageMode = 'persistent';
        setBootstrap({
          status: 'recovery-required',
          storageMode,
          reason: `restore-scene-${loaded.status}`,
        });
        return reject('restore', `scene-${loaded.status}`, token);
      }
      return commitLoadedSession(
        'start',
        decoded.value.narrative,
        expectedEpoch,
        'persistent',
        token,
      );
    })().finally(() => {
      if (bootstrapTask === task) bootstrapTask = null;
    });
    bootstrapTask = task;
    return task;
  };

  const recoverFreshSession: DemoRuntime['recoverFreshSession'] = () => {
    if (bootstrapTask) return bootstrapTask;
    if (disposed) return Promise.resolve(reject('recover', 'runtime-disposed'));
    const state = store.getState();
    if (state.bootstrap.status !== 'recovery-required' || state.durable.ready)
      return Promise.resolve(reject('recover', 'recovery-not-required'));
    const token = createToken();
    const expectedEpoch = state.durable.sessionEpoch;
    storageMode = 'session-only';
    persistenceArmed = false;
    setBootstrap({ status: 'starting', storageMode, reason: null });
    const task = loadFreshSession('recover', 'session-only', expectedEpoch, token).finally(() => {
      if (bootstrapTask === task) bootstrapTask = null;
    });
    bootstrapTask = task;
    return task;
  };

  const resetPlaythrough: DemoRuntime['resetPlaythrough'] = (confirmed) => {
    if (resetTask) return resetTask;
    if (disposed) return Promise.resolve(reject('reset', 'runtime-disposed'));
    if (!confirmed) return Promise.resolve(reject('reset', 'confirmation-required'));
    const before = store.getState();
    if (!before.durable.ready || !before.durable.sessionValid)
      return Promise.resolve(reject('reset', 'session-not-ready'));
    if (before.durable.narrative.activeDialogue)
      return Promise.resolve(reject('reset', 'dialogue-active'));

    const token = createToken();
    const oldEpoch = before.durable.sessionEpoch;
    persistenceArmed = false;
    pendingTransitionToken = null;
    store.dispatch({ type: 'RESET_BEGIN', token, expectedEpoch: oldEpoch });
    const expectedEpoch = oldEpoch + 1;
    if (store.getState().durable.sessionEpoch !== expectedEpoch)
      return Promise.resolve(store.getState().feedback!);

    const task = (async () => {
      const loaded = await host.start('map-courtyard');
      if (loaded.status !== 'committed') {
        setBootstrap({
          status: 'recovery-required',
          storageMode,
          reason: `reset-scene-${loaded.status}`,
        });
        return reject('reset', `scene-${loaded.status}`, token);
      }

      let nextMode: Exclude<DemoStorageMode, 'unknown'> = 'persistent';
      try {
        storage.removeItem(DEMO_SAVE_KEY);
      } catch {
        nextMode = 'session-only';
      }
      const result = commitLoadedSession(
        'reset',
        createNarrativeState(bloodLeafNarrative, idFactory()),
        expectedEpoch,
        nextMode,
        token,
      );
      if (result.accepted) {
        setBootstrap({ status: 'ready', storageMode: nextMode, reason: null });
        persistenceArmed = nextMode === 'persistent';
      }
      return result;
    })().finally(() => {
      if (resetTask === task) resetTask = null;
    });
    resetTask = task;
    return task;
  };

  const transitionTo: DemoRuntime['transitionTo'] = async (transitionId) => {
    const token = createToken();
    const state = store.getState();
    const blocked = transitionReason(state, transitionId, host, pendingTransitionToken !== null);
    if (blocked) return reject(`transition:${transitionId}`, blocked, token);
    const route = sceneTransitions.find((candidate) => candidate.id === transitionId);
    if (!route) return reject(`transition:${transitionId}`, 'scene-ineligible', token);
    pendingTransitionToken = token;
    const expectedEpoch = state.durable.sessionEpoch;
    try {
      const result = await host.transition(transitionId);
      const active = host.getSnapshot().active;
      if (result.status !== 'committed' || !active)
        return reject(`transition:${transitionId}`, `scene-${result.status}`, token);
      const snapshot = host.getSnapshot();
      dispatchCommitted({
        type: 'SCENE_COMMITTED',
        token,
        action: `transition:${transitionId}`,
        mapId: active.definition.map.id,
        anchorId: snapshot.currentAnchorId ?? active.entryAnchorId,
        expectedEpoch,
      });
      return store.getState().feedback!;
    } finally {
      if (pendingTransitionToken === token) pendingTransitionToken = null;
    }
  };

  return {
    getState: () => store.getState(),
    getDurableState: () => store.getState().durable,
    dispatch: (action) => {
      const token = createToken();
      if (disposed) return reject(actionName(action), 'runtime-disposed', token);
      dispatchCommitted({ type: 'NARRATIVE_ACTION', action, token });
      return store.getState().feedback!;
    },
    subscribe,
    start,
    recoverFreshSession,
    resetPlaythrough,
    transitionTo,
    pause: () => store.pause(),
    resume: () => store.resume(),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      persistenceArmed = false;
      pendingTransitionToken = null;
      for (const release of [...releases]) release();
      store.dispose();
    },
    getSubscriberCount: () => releases.size,
  };
}
