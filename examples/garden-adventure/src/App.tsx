import { Canvas } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { getDialogueView, getFact, getQuestStatus } from 'waypoint-rpg-narrative';
import { faUi } from './content/fa/ui.js';
import { createGardenRuntime } from './game/runtime.js';
import { GardenScene } from './scenes/GardenScene.js';
import { gardenTargets, getGardenTarget, type GardenTargetId } from './world/world.js';

export function App() {
  const runtime = useMemo(() => createGardenRuntime(), []);
  const state = useSyncExternalStore(runtime.subscribe, runtime.getState, runtime.getState);
  const [rendererReady, setRendererReady] = useState(false);
  const [recapOpen, setRecapOpen] = useState(false);
  const dialogue = getDialogueView(runtime.compiledNarrative, state.narrative, 'fa');
  const storyPath = getFact(state.narrative, 'story-path');
  const questId =
    storyPath === 'gardener' ? 'gardener-quest' : storyPath === 'lantern' ? 'lantern-quest' : null;
  const questStatus = questId
    ? getQuestStatus(runtime.compiledNarrative, state.narrative, questId)
    : null;
  const seedFound = getFact(state.narrative, 'seed-found') === true;
  const clueFound = getFact(state.narrative, 'clue-found') === true;
  const questObjective =
    storyPath === 'gardener'
      ? seedFound
        ? faUi.gardenerPlantObjective
        : faUi.gardenerSeedObjective
      : storyPath === 'lantern'
        ? clueFound
          ? faUi.travelerLanternObjective
          : faUi.travelerClueObjective
        : faUi.talkToChoosePath;

  useEffect(() => () => runtime.dispose(), [runtime]);

  useEffect(() => {
    if (state.narrative.endingId) setRecapOpen(true);
  }, [state.narrative.endingId]);

  useEffect(() => {
    if (!dialogue) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') runtime.dispatch({ type: 'DIALOGUE_EXIT' });
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [dialogue?.dialogueId, dialogue?.nodeId, runtime]);

  const onTargetPress = useCallback(
    (targetId: GardenTargetId) => {
      const current = runtime.getState();
      if (current.phase !== 'playing') return;
      const target = getGardenTarget(targetId);
      if (!target || target.mapId !== current.mapId) return;
      if (target.anchorId === current.anchorId && !current.walk) {
        if (targetId === 'recap-bench' && current.narrative.endingId) {
          setRecapOpen(true);
          return;
        }
        runtime.dispatch({ type: 'INTERACT', targetId });
        return;
      }
      runtime.dispatch({ type: 'MOVE_TO', targetId });
    },
    [runtime],
  );

  const mapLabel = faUi[state.mapId];
  const statusText = state.walk
    ? faUi.arriving
    : state.lastInteractionTarget
      ? `${faUi.reached}: ${faUi.targets[state.lastInteractionTarget]}`
      : faUi.choosePlace;

  return (
    <main className="garden-shell">
      <header className="garden-header">
        <span className="garden-mark" aria-hidden="true">
          ✿
        </span>
        <div className="garden-heading">
          <h1>{faUi.title}</h1>
          <p>{faUi.subtitle}</p>
        </div>
        {state.phase === 'playing' ? (
          <button
            className="quiet-button"
            data-testid="garden-new-game"
            type="button"
            onClick={() => runtime.dispatch({ type: 'NEW_GAME' })}
          >
            {faUi.newGame}
          </button>
        ) : null}
        {state.narrative.endingId ? (
          <button
            className="quiet-button"
            data-testid="garden-view-recap"
            type="button"
            onClick={() => setRecapOpen(true)}
          >
            {faUi.viewRecap}
          </button>
        ) : null}
      </header>

      {state.phase === 'title' ? (
        <section className="title-card" aria-label={faUi.title}>
          <div className="title-art" aria-hidden="true">
            🌱
          </div>
          <button
            className="primary-button"
            data-testid="garden-start"
            type="button"
            onClick={() => runtime.dispatch({ type: 'NEW_GAME' })}
          >
            {faUi.start}
          </button>
        </section>
      ) : (
        <section className="game-shell" aria-label={mapLabel} data-active-scene={state.mapId}>
          <div className="scene-frame" data-testid={`scene-${state.mapId}`}>
            <Canvas
              data-testid="garden-canvas-wrapper"
              frameloop="demand"
              camera={{ position: [0, 12, 14], fov: 42 }}
              onCreated={({ gl }) => {
                gl.domElement.dataset.testid = 'garden-canvas';
                gl.domElement.dataset.cameraKind = 'loading';
                setRendererReady(true);
              }}
            >
              <GardenScene
                key={state.mapId}
                runtime={runtime}
                state={state}
                onTargetPress={onTargetPress}
              />
            </Canvas>
            {!rendererReady ? (
              <div className="loading-message" role="status">
                {faUi.loading}
              </div>
            ) : null}
          </div>

          <div className="play-controls">
            <div className="map-status">
              <p className="location-label" data-testid="active-map" aria-live="polite">
                {mapLabel}
              </p>
              <p className="movement-status" role="status" data-testid="movement-status">
                {statusText}
              </p>
              <p className="quest-status" data-testid="quest-status" aria-live="polite">
                {questId && questStatus
                  ? `${questId === 'gardener-quest' ? faUi.gardenerQuest : faUi.lanternQuest} · ${faUi.questStatus[questStatus]} · ${questObjective}`
                  : questObjective}
              </p>
            </div>
            <nav className="target-navigation" aria-label={faUi.targetsHeading}>
              {gardenTargets
                .filter((target) => target.mapId === state.mapId)
                .map((target) => {
                  const label = faUi.targets[target.id];
                  const nearby = target.anchorId === state.anchorId && !state.walk;
                  return (
                    <button
                      className="target-button"
                      key={target.id}
                      data-testid={`target-${target.id}`}
                      data-nearby={nearby}
                      type="button"
                      aria-label={`${label}، ${nearby ? faUi.interact : faUi.approach}`}
                      aria-pressed={nearby}
                      onClick={() => onTargetPress(target.id)}
                    >
                      <span className="target-button-mark" aria-hidden="true">
                        {target.kind === 'gardener' || target.kind === 'traveler'
                          ? '●'
                          : target.kind === 'gate'
                            ? '⌂'
                            : '◆'}
                      </span>
                      <span>{label}</span>
                    </button>
                  );
                })}
            </nav>
          </div>
          {dialogue ? (
            <div className="dialogue-layer" data-testid="dialogue-layer">
              <button
                className="dialogue-backdrop"
                type="button"
                aria-label={faUi.dialogueBackdropLabel}
                onClick={() => runtime.dispatch({ type: 'DIALOGUE_EXIT' })}
              />
              <section
                className="dialogue-panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby="garden-dialogue-heading"
                data-testid="dialogue-panel"
              >
                <p className="dialogue-speaker">
                  {faUi.speakers[dialogue.speakerId as keyof typeof faUi.speakers] ??
                    faUi.dialogueHeading}
                </p>
                <h2 id="garden-dialogue-heading">{dialogue.text}</h2>
                <div className="dialogue-choices" aria-label={faUi.dialogueHeading}>
                  {dialogue.choices.map((choice, index) => (
                    <button
                      key={choice.id}
                      className="dialogue-choice"
                      data-testid={`dialogue-choice-${choice.id}`}
                      type="button"
                      disabled={!choice.available}
                      autoFocus={index === 0 && choice.available}
                      onClick={() =>
                        runtime.dispatch({ type: 'DIALOGUE_CHOICE', choiceId: choice.id })
                      }
                    >
                      {choice.label}
                    </button>
                  ))}
                </div>
                <button
                  className="quiet-button dialogue-exit"
                  data-testid="dialogue-exit"
                  type="button"
                  onClick={() => runtime.dispatch({ type: 'DIALOGUE_EXIT' })}
                >
                  {faUi.closeDialogue}
                </button>
              </section>
            </div>
          ) : null}
          {state.narrative.endingId && recapOpen ? (
            <div className="dialogue-layer" data-testid="ending-layer">
              <button
                className="dialogue-backdrop"
                type="button"
                aria-label={faUi.closeRecap}
                onClick={() => setRecapOpen(false)}
              />
              <section
                className="dialogue-panel ending-panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby="garden-ending-heading"
                data-testid="ending-panel"
              >
                <p className="dialogue-speaker">{faUi.recapHeading}</p>
                <h2 id="garden-ending-heading">
                  {state.narrative.endingId === 'ending-garden'
                    ? faUi.gardenerEnding
                    : faUi.lanternEnding}
                </h2>
                <p>{questObjective}</p>
                <button
                  className="primary-button"
                  data-testid="ending-close"
                  type="button"
                  autoFocus
                  onClick={() => setRecapOpen(false)}
                >
                  {faUi.closeRecap}
                </button>
              </section>
            </div>
          ) : null}
        </section>
      )}
    </main>
  );
}
