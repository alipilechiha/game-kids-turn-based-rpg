import { createGameRuntime, type AnchorId, type MapId } from 'waypoint-rpg-core';
import {
  createNarrativeState,
  getFact,
  transitionNarrative,
  type NarrativeCommand,
  type NarrativeState,
} from 'waypoint-rpg-narrative';
import { bloodLeafNarrative } from './content/blood-leaf.js';
import { sceneTransitions } from './scene-data.js';
import type { SceneHost } from './scene-host.js';

export type DemoSceneHost = Pick<SceneHost, 'getSnapshot' | 'start' | 'transition'>;

export type DemoNarrativeAction =
  | { readonly type: 'OPEN_DIALOGUE'; readonly dialogueId: string }
  | { readonly type: 'CHOOSE'; readonly choiceId: string }
  | { readonly type: 'ADVANCE' }
  | { readonly type: 'EXIT_DIALOGUE' }
  | { readonly type: 'FINISH' }
  | { readonly type: 'TRIGGER'; readonly triggerId: string };

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
  /** Transient per-command response. It is never part of a narrative save. */
  readonly feedback: DemoFeedback | null;
}

export interface DemoRuntime {
  getState(): DemoSnapshot;
  getDurableState(): DemoDurableState;
  subscribe(listener: () => void): () => void;
  /** Application command boundary; there is intentionally no raw store dispatch. */
  dispatch(action: DemoNarrativeAction): DemoFeedback;
  start(): Promise<DemoFeedback>;
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
      readonly initial: boolean;
    }
  | {
      readonly type: 'REJECT';
      readonly token: string;
      readonly action: string;
      readonly reason: string;
    };

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
    case 'FINISH':
      return { ...base, type: 'finish' };
    case 'TRIGGER':
      return { ...base, type: 'trigger', triggerId: action.triggerId };
  }
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
  if (!durable.ready) return 'not-ready';
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
    if (durable.mapId !== 'map-courtyard') return 'scene-ineligible';
    if (
      action.type === 'ADVANCE' ||
      action.type === 'CHOOSE' ||
      action.type === 'EXIT_DIALOGUE' ||
      action.type === 'FINISH'
    )
      return null;
    return 'dialogue-active';
  }

  if (action.type === 'OPEN_DIALOGUE')
    return durable.mapId === 'map-courtyard' && action.dialogueId === 'guardian-dialogue'
      ? null
      : 'scene-ineligible';
  if (action.type === 'TRIGGER')
    return durable.mapId === 'map-workshop' && action.triggerId === 'light-workshop-lantern'
      ? null
      : 'scene-ineligible';
  return 'no-active-dialogue';
}

function transitionReason(
  state: DemoSnapshot,
  transitionId: (typeof sceneTransitions)[number]['id'],
  host: DemoSceneHost,
  transitionPending: boolean,
): string | null {
  const durable = state.durable;
  if (!durable.ready) return 'not-ready';
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
      durable: state.durable,
      feedback: feedback(
        command.token,
        command.action,
        false,
        state.durable.narrative.revision,
        command.reason,
      ),
    };

  if (command.type === 'NARRATIVE_ACTION') {
    const name = actionName(command.action);
    const blocked = eligibilityReason(state, command.action, host, transitionPending());
    if (blocked)
      return {
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
    return { durable, feedback: feedback(command.token, name, true, result.state.revision) };
  }

  const active = host.getSnapshot().active;
  const validCommit =
    command.expectedEpoch === state.durable.sessionEpoch &&
    active?.definition.map.id === command.mapId &&
    host.getSnapshot().pendingMapId === null &&
    (command.initial
      ? !state.durable.ready && command.mapId === 'map-courtyard'
      : state.durable.ready &&
        state.durable.sessionValid &&
        !state.durable.narrative.activeDialogue);
  if (!validCommit)
    return {
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
  });
  return {
    durable,
    feedback: feedback(command.token, command.action, true, durable.narrative.revision),
  };
}

export function createDemoRuntime(host: DemoSceneHost): DemoRuntime {
  let pendingTransition = false;
  let disposed = false;
  let commandSequence = 0;
  let startTask: Promise<DemoFeedback> | null = null;
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
        narrative: createNarrativeState(bloodLeafNarrative, 'blood-leaf-playthrough'),
      }),
      feedback: null,
    }),
    reducer: (state, command) => reduceDemoState(state, command, host, () => pendingTransition),
  });

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

  const start: DemoRuntime['start'] = () => {
    if (startTask) return startTask;
    if (disposed) return Promise.resolve(reject('start', 'runtime-disposed'));
    if (store.getState().durable.ready) return Promise.resolve(reject('start', 'already-ready'));
    const token = createToken();
    const expectedEpoch = store.getState().durable.sessionEpoch;
    startTask = (async () => {
      const result = await host.start('map-courtyard');
      const active = host.getSnapshot().active;
      if (result.status !== 'committed' || !active)
        return reject('start', `scene-${result.status}`, token);
      store.dispatch({
        type: 'SCENE_COMMITTED',
        token,
        action: 'start',
        mapId: active.definition.map.id,
        anchorId: host.getSnapshot().currentAnchorId ?? active.entryAnchorId,
        expectedEpoch,
        initial: true,
      });
      return store.getState().feedback!;
    })().finally(() => {
      startTask = null;
    });
    return startTask;
  };

  const transitionTo: DemoRuntime['transitionTo'] = async (transitionId) => {
    const token = createToken();
    const state = store.getState();
    const blocked = transitionReason(state, transitionId, host, pendingTransition);
    if (blocked) return reject(`transition:${transitionId}`, blocked, token);
    const route = sceneTransitions.find((candidate) => candidate.id === transitionId);
    if (!route) return reject(`transition:${transitionId}`, 'scene-ineligible', token);
    pendingTransition = true;
    const expectedEpoch = state.durable.sessionEpoch;
    try {
      const result = await host.transition(transitionId);
      const active = host.getSnapshot().active;
      if (result.status !== 'committed' || !active)
        return reject(`transition:${transitionId}`, `scene-${result.status}`, token);
      store.dispatch({
        type: 'SCENE_COMMITTED',
        token,
        action: `transition:${transitionId}`,
        mapId: active.definition.map.id,
        anchorId: host.getSnapshot().currentAnchorId ?? active.entryAnchorId,
        expectedEpoch,
        initial: false,
      });
      return store.getState().feedback!;
    } finally {
      pendingTransition = false;
    }
  };

  return {
    getState: () => store.getState(),
    getDurableState: () => store.getState().durable,
    dispatch: (action) => {
      const token = createToken();
      if (disposed) return reject(actionName(action), 'runtime-disposed', token);
      store.dispatch({ type: 'NARRATIVE_ACTION', action, token });
      return store.getState().feedback!;
    },
    subscribe,
    start,
    transitionTo,
    pause: () => store.pause(),
    resume: () => store.resume(),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      for (const release of [...releases]) release();
      store.dispose();
    },
    getSubscriberCount: () => releases.size,
  };
}
