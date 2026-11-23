import { createGameRuntime, type AnchorId, type MapId } from 'waypoint-rpg-core';
import {
  createGameplayState,
  transitionGameplay,
  type GameplayPlayerIntent,
  type GameplayState,
} from 'waypoint-rpg-gameplay';
import {
  createNarrativeState,
  getFact,
  transitionNarrative,
  type NarrativeCommand,
  type NarrativeState,
} from 'waypoint-rpg-narrative';
import { bloodLeafGameplay, GUARDIAN_TRIAL_ENCOUNTER_ID } from './content/blood-leaf-gameplay.js';
import { bloodLeafDefinition, bloodLeafNarrative } from './content/blood-leaf.js';
import { executeCombatTransaction } from './gameplay-transaction.js';
import { sceneTransitions } from './scene-data.js';
import type { SceneHost } from './scene-host.js';
import {
  browserDemoStorage,
  decodeDemoSave,
  DEMO_SAVE_KEY,
  encodeDemoSave,
  type DemoStorage,
  type DemoSaveValue,
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

export type DemoGameplayAction =
  | { readonly type: 'START_ENCOUNTER' }
  | { readonly type: 'COMBAT_INTENT'; readonly intent: GameplayPlayerIntent };

export type DemoAction = DemoNarrativeAction | DemoGameplayAction;

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
  readonly gameplay: GameplayState;
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
  dispatch(action: DemoAction): DemoFeedback;
  start(): Promise<DemoFeedback>;
  retrySavedScene(): Promise<DemoFeedback>;
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
      readonly type: 'GAMEPLAY_ACTION';
      readonly action: DemoGameplayAction;
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
      readonly gameplay: GameplayState;
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
let encounterInstanceSequence = 0;

function isEncounterActive(gameplay: GameplayState): boolean {
  const encounter = gameplay.encounter;
  return encounter !== null && encounter.outcome === null;
}

function createEncounterInstanceId(): string {
  const nonce =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replaceAll('-', '')
      : `${Date.now().toString(36)}-${++encounterInstanceSequence}`;
  return `guardian-trial-${nonce}`;
}

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

function actionName(action: DemoAction): string {
  if (action.type === 'START_ENCOUNTER') return 'start-encounter';
  if (action.type === 'COMBAT_INTENT') {
    switch (action.intent.type) {
      case 'use-ability':
        return `ability:${action.intent.abilityId}`;
      case 'move':
        return 'move';
      default:
        return action.intent.type;
    }
  }
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

function startEncounterEligibility(state: DemoSnapshot, transitionPending: boolean): string | null {
  const durable = state.durable;
  if (!durable.ready || state.bootstrap.status !== 'ready') return 'not-ready';
  if (!durable.sessionValid) return 'session-invalidated';
  if (transitionPending) return 'scene-pending';
  if (durable.narrative.activeDialogue) return 'dialogue-active';
  if (isEncounterActive(durable.gameplay)) return 'encounter-active';
  if (durable.mapId !== 'map-courtyard') return 'scene-ineligible';
  if (getFact(durable.narrative, 'seeking-vengeance') !== true) return 'scene-ineligible';
  if (getFact(durable.narrative, 'guardian-trial-complete') === true) return 'scene-condition';
  return null;
}

function combatIntentEligibility(state: DemoSnapshot, transitionPending: boolean): string | null {
  const durable = state.durable;
  if (!durable.ready || state.bootstrap.status !== 'ready') return 'not-ready';
  if (!durable.sessionValid) return 'session-invalidated';
  if (transitionPending) return 'scene-pending';
  if (!isEncounterActive(durable.gameplay)) return 'encounter-inactive';
  return null;
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
  if (isEncounterActive(durable.gameplay)) return 'encounter-active';

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
  if (isEncounterActive(durable.gameplay)) return 'encounter-active';
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

  if (command.type === 'GAMEPLAY_ACTION') {
    const name = actionName(command.action);
    const blocked =
      command.action.type === 'START_ENCOUNTER'
        ? startEncounterEligibility(state, transitionPending())
        : combatIntentEligibility(state, transitionPending());
    if (blocked)
      return {
        ...state,
        durable: state.durable,
        feedback: feedback(command.token, name, false, state.durable.narrative.revision, blocked),
      };

    if (command.action.type === 'START_ENCOUNTER') {
      const begun = transitionGameplay(bloodLeafGameplay, state.durable.gameplay, {
        type: 'start-encounter',
        playthroughId: state.durable.gameplay.playthroughId,
        expectedRevision: state.durable.gameplay.revision,
        encounterId: GUARDIAN_TRIAL_ENCOUNTER_ID,
        instanceId: createEncounterInstanceId(),
      });
      if (!begun.accepted)
        return {
          ...state,
          durable: state.durable,
          feedback: feedback(
            command.token,
            name,
            false,
            state.durable.narrative.revision,
            begun.reason.code,
          ),
        };
      const durable = Object.freeze({ ...state.durable, gameplay: begun.state });
      return {
        ...state,
        durable,
        feedback: feedback(command.token, name, true, durable.narrative.revision),
      };
    }

    const encounterInstanceId = state.durable.gameplay.encounter?.instanceId;
    const combat = executeCombatTransaction({
      gameplayCompiled: bloodLeafGameplay,
      narrativeCompiled: bloodLeafNarrative,
      gameplay: state.durable.gameplay,
      narrative: state.durable.narrative,
      intent: command.action.intent,
      playthroughId: state.durable.gameplay.playthroughId,
      expectedGameplayRevision: state.durable.gameplay.revision,
      ...(encounterInstanceId !== undefined ? { encounterInstanceId } : {}),
    });
    if (!combat.accepted)
      return {
        ...state,
        durable: state.durable,
        feedback: feedback(
          command.token,
          name,
          false,
          state.durable.narrative.revision,
          combat.reason,
        ),
      };
    const durable = Object.freeze({
      ...state.durable,
      gameplay: combat.gameplay,
      narrative: combat.narrative,
    });
    return {
      ...state,
      durable,
      feedback: feedback(command.token, name, true, durable.narrative.revision),
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
      gameplay: command.gameplay,
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
    !isEncounterActive(state.durable.gameplay) &&
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
  let pendingSavedRestore: DemoSaveValue | null = null;
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
        gameplay: createGameplayState(bloodLeafGameplay, 'blood-leaf-bootstrap'),
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
          gameplay: durable.gameplay,
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
    gameplay: GameplayState,
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
      gameplay,
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
    const playthroughId = idFactory();
    const narrative = createNarrativeState(bloodLeafNarrative, playthroughId);
    const gameplay = createGameplayState(bloodLeafGameplay, playthroughId);
    const loaded = await host.start('map-courtyard');
    if (loaded.status !== 'committed') {
      setBootstrap({
        status: 'recovery-required',
        storageMode: mode,
        reason: `scene-${loaded.status}`,
      });
      return reject(action, `scene-${loaded.status}`, token);
    }
    return commitLoadedSession(action, narrative, gameplay, expectedEpoch, mode, token);
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
        pendingSavedRestore = null;
        storageMode = 'persistent';
        return loadFreshSession('start', storageMode, expectedEpoch, token);
      }

      const decoded = decodeDemoSave(raw);
      if (!decoded.ok) {
        pendingSavedRestore = null;
        storageMode = 'persistent';
        setBootstrap({
          status: 'recovery-required',
          storageMode,
          reason: `${decoded.kind}:${decoded.message}`,
        });
        return reject('start', `save-${decoded.kind}`, token);
      }

      pendingSavedRestore = decoded.value;
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
      const restoredGameplay =
        decoded.value.gameplay ??
        createGameplayState(bloodLeafGameplay, decoded.value.narrative.playthroughId);
      const result = commitLoadedSession(
        'start',
        decoded.value.narrative,
        restoredGameplay,
        expectedEpoch,
        'persistent',
        token,
      );
      if (result.accepted) pendingSavedRestore = null;
      return result;
    })().finally(() => {
      if (bootstrapTask === task) bootstrapTask = null;
    });
    bootstrapTask = task;
    return task;
  };

  const retrySavedScene: DemoRuntime['retrySavedScene'] = () => {
    if (bootstrapTask) return bootstrapTask;
    if (disposed) return Promise.resolve(reject('retry-saved-scene', 'runtime-disposed'));
    const state = store.getState();
    const pending = pendingSavedRestore;
    if (
      state.bootstrap.status !== 'recovery-required' ||
      state.durable.ready ||
      pending === null ||
      !state.bootstrap.reason?.startsWith('restore-scene-')
    )
      return Promise.resolve(reject('retry-saved-scene', 'saved-scene-retry-unavailable'));

    const token = createToken();
    const expectedEpoch = state.durable.sessionEpoch;
    setBootstrap({ status: 'starting', storageMode: 'persistent', reason: null });
    const task = (async () => {
      const loaded = await host.start(pending.mapId, pending.entryAnchorId);
      if (loaded.status !== 'committed') {
        setBootstrap({
          status: 'recovery-required',
          storageMode: 'persistent',
          reason: `restore-scene-${loaded.status}`,
        });
        return reject('retry-saved-scene', `scene-${loaded.status}`, token);
      }
      const restoredGameplay =
        pending.gameplay ?? createGameplayState(bloodLeafGameplay, pending.narrative.playthroughId);
      const result = commitLoadedSession(
        'start',
        pending.narrative,
        restoredGameplay,
        expectedEpoch,
        'persistent',
        token,
      );
      if (result.accepted) pendingSavedRestore = null;
      else
        setBootstrap({
          status: 'recovery-required',
          storageMode: 'persistent',
          reason: 'restore-scene-commit-failed',
        });
      return result;
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
    pendingSavedRestore = null;
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
    if (isEncounterActive(before.durable.gameplay))
      return Promise.resolve(reject('reset', 'encounter-active'));

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
        if (storage.getItem(DEMO_SAVE_KEY) !== null) nextMode = 'session-only';
      } catch {
        nextMode = 'session-only';
      }
      const playthroughId = idFactory();
      const result = commitLoadedSession(
        'reset',
        createNarrativeState(bloodLeafNarrative, playthroughId),
        createGameplayState(bloodLeafGameplay, playthroughId),
        expectedEpoch,
        nextMode,
        token,
      );
      if (result.accepted) {
        setBootstrap({
          status: 'ready',
          storageMode: nextMode,
          reason: nextMode === 'session-only' ? 'save-reset-clear-failed' : null,
        });
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
      if (action.type === 'START_ENCOUNTER' || action.type === 'COMBAT_INTENT')
        dispatchCommitted({ type: 'GAMEPLAY_ACTION', action, token });
      else dispatchCommitted({ type: 'NARRATIVE_ACTION', action, token });
      return store.getState().feedback!;
    },
    subscribe,
    start,
    retrySavedScene,
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
