import { bloodLeafGameplayCopy } from './content/blood-leaf-gameplay.js';
import type { EncounterView } from './encounter-view.js';
import type { DemoGameplayAction } from './runtime.js';

interface EncounterPanelProps {
  readonly view: EncounterView;
  readonly onAction: (action: DemoGameplayAction) => void;
  readonly disabled?: boolean;
}

export function EncounterPanel({ view, onAction, disabled = false }: EncounterPanelProps) {
  if (!view.active) return null;
  const playerId = view.playerParticipantId;
  const busy = disabled || !view.isPlayerTurn || view.outcome !== null;

  return (
    <section
      className="encounter-panel"
      data-testid="encounter-panel"
      aria-label={bloodLeafGameplayCopy.title}
    >
      <header className="encounter-header">
        <h2>{bloodLeafGameplayCopy.title}</h2>
        <output data-testid="encounter-status" data-outcome={view.outcome ?? ''} role="status">
          {view.outcome === 'victory'
            ? bloodLeafGameplayCopy.victory
            : view.outcome === 'defeat' ||
                view.outcome === 'turn-limit' ||
                view.outcome === 'withdrawn'
              ? bloodLeafGameplayCopy.defeat
              : view.isPlayerTurn
                ? bloodLeafGameplayCopy.yourTurn
                : bloodLeafGameplayCopy.enemyTurn}
          {` · ${view.turn}`}
        </output>
      </header>

      <div
        className="encounter-board"
        role="grid"
        aria-label={bloodLeafGameplayCopy.boardLabel}
        style={{
          gridTemplateColumns: `repeat(${view.boardWidth}, minmax(2.5rem, 1fr))`,
        }}
      >
        {Array.from({ length: view.boardHeight }, (_, y) =>
          Array.from({ length: view.boardWidth }, (_, x) => {
            const occupant = view.combatants.find((c) => c.x === x && c.y === y);
            const moveHere = view.legalMoves.some((cell) => cell.x === x && cell.y === y);
            return (
              <button
                key={`${x}-${y}`}
                type="button"
                role="gridcell"
                className={`encounter-cell${occupant ? ` team-${occupant.team}` : ''}${moveHere ? ' legal-move' : ''}`}
                data-testid={`encounter-cell-${x}-${y}`}
                disabled={busy || !moveHere || !playerId}
                aria-label={
                  occupant
                    ? `${occupant.characterId} ${bloodLeafGameplayCopy.health} ${occupant.health}`
                    : moveHere
                      ? `${bloodLeafGameplayCopy.move} ${x},${y}`
                      : `${x},${y}`
                }
                onClick={() => {
                  if (!playerId || !moveHere) return;
                  onAction({
                    type: 'COMBAT_INTENT',
                    intent: {
                      type: 'move',
                      participantId: playerId,
                      destination: { x, y },
                    },
                  });
                }}
              >
                {occupant ? (occupant.team === 'player' ? 'ش' : 'ن') : moveHere ? '·' : ''}
              </button>
            );
          }),
        )}
      </div>

      <ul className="encounter-roster" aria-label={bloodLeafGameplayCopy.health}>
        {view.combatants.map((combatant) => (
          <li key={combatant.id} data-testid={`encounter-fighter-${combatant.id}`}>
            <span>{combatant.characterId}</span>
            <span>
              {bloodLeafGameplayCopy.health} {combatant.health}/{combatant.maxHealth}
            </span>
          </li>
        ))}
      </ul>

      {view.outcome === null && (
        <div className="encounter-actions" role="group" aria-label={bloodLeafGameplayCopy.title}>
          <button
            type="button"
            data-testid="encounter-strike"
            disabled={busy || !view.canStrike || !playerId || !view.strikeTargetId}
            onClick={() => {
              if (!playerId || !view.strikeTargetId) return;
              onAction({
                type: 'COMBAT_INTENT',
                intent: {
                  type: 'use-ability',
                  participantId: playerId,
                  abilityId: 'strike',
                  targetParticipantId: view.strikeTargetId,
                },
              });
            }}
          >
            {bloodLeafGameplayCopy.strike}
          </button>
          <button
            type="button"
            data-testid="encounter-lethal"
            disabled={busy || !view.canLethal || !playerId || !view.strikeTargetId}
            onClick={() => {
              if (!playerId || !view.strikeTargetId) return;
              onAction({
                type: 'COMBAT_INTENT',
                intent: {
                  type: 'use-ability',
                  participantId: playerId,
                  abilityId: 'lethal-mark',
                  targetParticipantId: view.strikeTargetId,
                },
              });
            }}
          >
            {bloodLeafGameplayCopy.lethal}
          </button>
          <button
            type="button"
            data-testid="encounter-wait"
            disabled={busy || !view.canWait || !playerId}
            onClick={() => {
              if (!playerId) return;
              onAction({
                type: 'COMBAT_INTENT',
                intent: { type: 'wait', participantId: playerId },
              });
            }}
          >
            {bloodLeafGameplayCopy.wait}
          </button>
          <button
            type="button"
            data-testid="encounter-withdraw"
            disabled={busy || !view.canWithdraw}
            onClick={() => onAction({ type: 'COMBAT_INTENT', intent: { type: 'withdraw' } })}
          >
            {bloodLeafGameplayCopy.withdraw}
          </button>
        </div>
      )}
    </section>
  );
}
