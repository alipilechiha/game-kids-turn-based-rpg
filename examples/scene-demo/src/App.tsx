import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Canvas } from '@react-three/fiber';
import { getAnchor } from 'waypoint-rpg-core';
import { getDialogueView, getQuestStatus, getFact } from 'waypoint-rpg-narrative';
import { DialogueDialog } from './DialogueDialog.js';
import { bloodLeafCopy, bloodLeafNarrative } from './content/blood-leaf.js';
import { SceneCamera } from './SceneCamera.js';
import { SceneFrameProbe } from './SceneFrameProbe.js';
import { browserDemoStorage } from './persistence.js';
import { createDemoRuntime } from './runtime.js';
import { SceneHost } from './scene-host.js';
import { sceneRegistry } from './scenes/registry.js';
import { subscribeDemoRuntime } from './scenes/scene-runtime.js';

export function App() {
  const host = useMemo(() => new SceneHost(sceneRegistry), []);
  const runtime = useMemo(() => createDemoRuntime(host, { storage: browserDemoStorage }), [host]);
  const snapshot = useSyncExternalStore(host.subscribe, host.getSnapshot, host.getSnapshot);
  const subscribeRuntime = useCallback(
    (listener: () => void) => subscribeDemoRuntime(runtime, listener),
    [runtime],
  );
  const appState = useSyncExternalStore(subscribeRuntime, runtime.getState, runtime.getState);
  const { durable, bootstrap, feedback } = appState;
  const [canvasVersion, setCanvasVersion] = useState(0);
  const [contextLost, setContextLost] = useState(false);
  const canvasLive = useRef(false);
  const mainRef = useRef<HTMLElement | null>(null);
  const dialogueOpenerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    void runtime.start();
    return () => {
      canvasLive.current = false;
      host.dispose();
      runtime.dispose();
    };
  }, [host, runtime]);

  const onContextLost = useCallback((event: Event) => {
    event.preventDefault();
    if (!canvasLive.current) return;
    canvasLive.current = false;
    setContextLost(true);
  }, []);

  const onCreated = useCallback(
    ({ gl }: { gl: { domElement: HTMLCanvasElement } }) => {
      canvasLive.current = true;
      gl.domElement.dataset.testid = 'scene-canvas';
      gl.domElement.addEventListener('webglcontextlost', onContextLost, { once: true });
    },
    [onContextLost],
  );

  const active = snapshot.active;
  const ActiveScene = active?.resource.Component;
  const activeAnchorId = snapshot.currentAnchorId ?? active?.entryAnchorId;
  const target =
    active && activeAnchorId ? getAnchor(active.definition.graph, activeAnchorId) : null;
  const toWorkshop = active?.definition.map.id !== 'map-workshop';
  const transitionId = toWorkshop ? 'transition-to-workshop' : 'transition-to-courtyard';
  const transitionLabel = toWorkshop ? 'Travel to workshop' : 'Return to courtyard';
  const narrative = durable.narrative;
  const onNarrativeCommand = useCallback(
    (action: Parameters<typeof runtime.dispatch>[0]) => {
      runtime.dispatch(action);
    },
    [runtime],
  );
  const dialogue = getDialogueView(bloodLeafNarrative, narrative, 'fa-IR');
  const questStatus = getQuestStatus(bloodLeafNarrative, narrative, 'leaf-inquiry');
  const factTruth = getFact(narrative, 'seeking-truth') === true;
  const factVengeance = getFact(narrative, 'seeking-vengeance') === true;
  const lanternLit = getFact(narrative, 'lantern-lit') === true;
  const routeUnlocked = factTruth || factVengeance;
  const ending = narrative.endingId
    ? bloodLeafCopy.endings[narrative.endingId as keyof typeof bloodLeafCopy.endings]
    : '';

  return (
    <>
      <main className="demo-shell" ref={mainRef} tabIndex={-1}>
        <header className="demo-header">
          <div>
            <p className="eyebrow">Independent consumer</p>
            <h1>Three.js narrative integration</h1>
            <p>Two registered scenes use the core and optional narrative packages.</p>
          </div>
          <div className="status-grid" aria-live="polite">
            <span>Map</span>
            <output data-testid="active-map">{active?.definition.map.id ?? 'loading'}</output>
            <span>Camera</span>
            <output data-testid="camera-kind">{active?.definition.camera.kind ?? 'loading'}</output>
            <span>Arrival</span>
            <output data-testid="entry-anchor">{active?.entryAnchorId ?? 'loading'}</output>
            <span>Session</span>
            <output data-testid="session-readiness">
              {durable.ready ? 'ready' : bootstrap.status}
            </output>
            <span>Save</span>
            <output data-testid="save-mode">{bootstrap.storageMode}</output>
            <span>{bloodLeafCopy.inquiryQuest}</span>
            <output data-testid="quest-status" data-status={questStatus}>
              {bloodLeafCopy.questStatus[questStatus]}
            </output>
            <span>Ending</span>
            <output data-testid="story-ending">{ending}</output>
          </div>
        </header>

        <section className="controls" aria-label="Demo controls">
          {active?.definition.map.id === 'map-courtyard' && (
            <button
              ref={dialogueOpenerRef}
              data-testid="dialogue-open"
              type="button"
              disabled={!durable.ready || Boolean(dialogue) || narrative.endingId !== null}
              onClick={() => {
                dialogueOpenerRef.current = document.activeElement as HTMLButtonElement;
                runtime.dispatch({ type: 'OPEN_DIALOGUE', dialogueId: 'guardian-dialogue' });
              }}
            >
              {narrative.suspendedDialogue
                ? bloodLeafCopy.resumeDialogue
                : bloodLeafCopy.startDialogue}
            </button>
          )}
          <button
            data-testid="scene-transition"
            type="button"
            disabled={
              !durable.ready ||
              snapshot.pendingMapId !== null ||
              Boolean(dialogue) ||
              (toWorkshop && !routeUnlocked)
            }
            onClick={() => void runtime.transitionTo(transitionId)}
          >
            {snapshot.pendingMapId ? `Loading ${snapshot.pendingMapId}…` : transitionLabel}
          </button>
          {active?.definition.map.id === 'map-workshop' && (
            <button
              data-testid="lantern-interaction"
              type="button"
              disabled={!durable.ready || !factTruth || lanternLit || Boolean(dialogue)}
              onClick={() =>
                runtime.dispatch({ type: 'TRIGGER', triggerId: 'light-workshop-lantern' })
              }
            >
              {lanternLit ? 'Lantern: lit' : 'Lantern: dark'}
            </button>
          )}
          <button
            data-testid="story-reset"
            type="button"
            disabled={!durable.ready || Boolean(dialogue)}
            onClick={() => {
              if (window.confirm(bloodLeafCopy.confirmReset)) void runtime.resetPlaythrough(true);
            }}
          >
            {bloodLeafCopy.resetStory}
          </button>
          <output
            className="command-feedback"
            data-testid="command-feedback"
            data-command-token={feedback?.token ?? ''}
            data-command-accepted={feedback ? String(feedback.accepted) : ''}
            role="status"
            aria-live="polite"
          >
            {feedback && !feedback.accepted ? `${feedback.action}: ${feedback.reason}` : ''}
          </output>
          <output className="error" data-testid="scene-error" role="status">
            {snapshot.error ?? ''}
          </output>
        </section>

        {bootstrap.status === 'recovery-required' && (
          <section className="save-recovery" role="alert" data-testid="save-recovery">
            <p>{bootstrap.reason}</p>
            <p>{bloodLeafCopy.recoveryExplanation}</p>
            <button
              data-testid="recover-session"
              type="button"
              onClick={() => void runtime.recoverFreshSession()}
            >
              {bloodLeafCopy.recoverStory}
            </button>
          </section>
        )}
        {bootstrap.reason === 'save-write-failed' && (
          <p className="save-warning" role="status" data-testid="save-warning">
            {bloodLeafCopy.sessionOnly}
          </p>
        )}

        <section className="scene-stage" aria-label="3D game scene">
          {active && ActiveScene && target ? (
            <Canvas
              key={canvasVersion}
              frameloop="demand"
              camera={{ position: [0, 8, 9], fov: 48 }}
              onCreated={onCreated}
            >
              <SceneFrameProbe />
              <SceneCamera configuration={active.definition.camera} target={target} />
              <ActiveScene entryAnchorId={active.entryAnchorId} runtime={runtime} />
            </Canvas>
          ) : (
            <p className="loading" data-testid="scene-loading">
              {snapshot.error ? 'Scene failed to load.' : 'Loading first scene…'}
            </p>
          )}
        </section>

        {contextLost && (
          <div className="recovery" role="alert">
            <span>Graphics stopped. Rebuild the view to continue.</span>
            <button
              data-testid="restore-context"
              type="button"
              onClick={() => {
                canvasLive.current = false;
                setContextLost(false);
                setCanvasVersion((version) => version + 1);
              }}
            >
              Rebuild 3D view
            </button>
          </div>
        )}
      </main>

      <DialogueDialog
        view={dialogue}
        speakerName={bloodLeafCopy.guardian}
        choicesLabel={bloodLeafCopy.choicesLabel}
        continueLabel={bloodLeafCopy.continue}
        finishLabel={bloodLeafCopy.finish}
        leaveLabel={bloodLeafCopy.leave}
        onCommand={onNarrativeCommand}
        openerRef={dialogueOpenerRef}
        fallbackFocusRef={mainRef}
      />
    </>
  );
}
