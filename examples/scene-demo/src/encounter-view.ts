import {
  getEffectiveCharacterAttributes,
  type CompiledGameplay,
  type GameplayCell,
  type GameplayState,
} from 'waypoint-rpg-gameplay';

export interface EncounterView {
  readonly active: boolean;
  readonly outcome: string | null;
  readonly turn: number;
  readonly activeParticipantId: string | null;
  readonly isPlayerTurn: boolean;
  readonly boardWidth: number;
  readonly boardHeight: number;
  readonly combatants: readonly {
    readonly id: string;
    readonly characterId: string;
    readonly team: 'player' | 'enemy';
    readonly x: number;
    readonly y: number;
    readonly health: number;
    readonly maxHealth: number;
    readonly movement: number;
  }[];
  readonly playerParticipantId: string | null;
  readonly legalMoves: readonly GameplayCell[];
  readonly canStrike: boolean;
  readonly canLethal: boolean;
  readonly canWait: boolean;
  readonly canWithdraw: boolean;
  readonly strikeTargetId: string | null;
}

function manhattan(a: GameplayCell, b: GameplayCell): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function getEncounterView(compiled: CompiledGameplay, state: GameplayState): EncounterView {
  const encounter = state.encounter;
  if (!encounter) {
    return {
      active: false,
      outcome: null,
      turn: 0,
      activeParticipantId: null,
      isPlayerTurn: false,
      boardWidth: 0,
      boardHeight: 0,
      combatants: [],
      playerParticipantId: null,
      legalMoves: [],
      canStrike: false,
      canLethal: false,
      canWait: false,
      canWithdraw: false,
      strikeTargetId: null,
    };
  }

  const definition = compiled.definition.encounters.find(
    (item) => item.id === encounter.definitionId,
  );
  const board = compiled.definition.boards.find((item) => item.id === definition?.boardId);
  const healthId = compiled.definition.healthResourceId;
  const healthMax =
    compiled.definition.resources.find((item) => item.id === healthId)?.maximum ?? 1;
  const active = encounter.combatants.find((item) => item.id === encounter.activeParticipantId);
  const isPlayerTurn = encounter.outcome === null && active?.team === 'player';
  const player = encounter.combatants.find((item) => item.team === 'player') ?? null;
  const enemies = encounter.combatants.filter(
    (item) => item.team === 'enemy' && (item.resources[healthId] ?? 0) > 0,
  );

  const legalMoves: GameplayCell[] = [];
  if (isPlayerTurn && player && board && definition) {
    const movement =
      getEffectiveCharacterAttributes(compiled, state, player.characterId, player.id).movement ?? 0;
    for (let y = 0; y < board.height; y += 1) {
      for (let x = 0; x < board.width; x += 1) {
        const cell = { x, y };
        if (manhattan(player.position, cell) === 0) continue;
        if (manhattan(player.position, cell) > movement) continue;
        if (board.blockedCells.some((blocked) => blocked.x === x && blocked.y === y)) continue;
        if (encounter.combatants.some((c) => c.position.x === x && c.position.y === y)) continue;
        legalMoves.push(cell);
      }
    }
  }

  let strikeTargetId: string | null = null;
  let canStrike = false;
  let canLethal = false;
  if (isPlayerTurn && player) {
    const adjacent = enemies
      .filter((enemy) => manhattan(player.position, enemy.position) === 1)
      .sort((a, b) => a.id.localeCompare(b.id));
    strikeTargetId = adjacent[0]?.id ?? null;
    canStrike = strikeTargetId !== null && (player.resources.focus ?? 0) >= 1;
    canLethal = strikeTargetId !== null;
  }

  return {
    active: true,
    outcome: encounter.outcome,
    turn: encounter.round,
    activeParticipantId: encounter.activeParticipantId,
    isPlayerTurn,
    boardWidth: board?.width ?? 0,
    boardHeight: board?.height ?? 0,
    combatants: encounter.combatants.map((combatant) => ({
      id: combatant.id,
      characterId: combatant.characterId,
      team: combatant.team,
      x: combatant.position.x,
      y: combatant.position.y,
      health: combatant.resources[healthId] ?? 0,
      maxHealth: healthMax,
      movement:
        getEffectiveCharacterAttributes(compiled, state, combatant.characterId, combatant.id)
          .movement ?? 0,
    })),
    playerParticipantId: player?.id ?? null,
    legalMoves,
    canStrike,
    canLethal,
    canWait: isPlayerTurn,
    canWithdraw: isPlayerTurn && definition?.allowWithdrawal === true,
    strikeTargetId,
  };
}
