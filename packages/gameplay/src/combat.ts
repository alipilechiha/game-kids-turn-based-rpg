import type {
  CompiledGameplay,
  GameplayCell,
  GameplayCommand,
  GameplayCombatantState,
  GameplayEncounterDefinition,
  GameplayEncounterState,
  GameplayGrantCommand,
  GameplayOutcome,
  GameplayPlayerIntent,
  GameplayRejectionCode,
  GameplayState,
  GameplayTransitionResult,
} from './definition.js';
import {
  cloneGameplayValue,
  rejectGameplay,
  snapshotGameplayState,
  type GameplayDraft,
} from './internal.js';
import { getEffectiveCharacterAttributes, getUnlockedAbilityIds } from './state.js';
import { applyGrantToDraft } from './rewards.js';

const SAFE_ID = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/;
const DIRECTIONS = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
] as const;

type DraftEncounter = NonNullable<GameplayDraft['encounter']>;
type DraftCombatant = DraftEncounter['combatants'][number];

/** Handles encounter and player combat intents. Enemy actions remain package-internal. */
export function transitionCombat(
  compiled: CompiledGameplay,
  state: GameplayState,
  command: GameplayCommand,
): GameplayTransitionResult | null {
  switch (command.type) {
    case 'start-encounter':
      return startEncounter(compiled, state, command);
    case 'move':
    case 'use-ability':
    case 'wait':
    case 'withdraw':
      return takePlayerTurn(compiled, state, command);
    default:
      return null;
  }
}

function startEncounter(
  compiled: CompiledGameplay,
  state: GameplayState,
  command: Extract<GameplayCommand, { type: 'start-encounter' }>,
): GameplayTransitionResult {
  if (state.encounter?.outcome === null)
    return rejectGameplay(state, 'encounter-active', 'An encounter is already active.');
  if (!isSafeId(command.instanceId) || command.instanceId.length > 110)
    return rejectGameplay(
      state,
      'invalid-command',
      'Encounter instance ID must be a stable identifier of at most 110 characters.',
    );
  if (state.outcomeMarkers.some((marker) => marker.encounterInstanceId === command.instanceId))
    return rejectGameplay(
      state,
      'invalid-command',
      'Encounter instance IDs cannot be reused in one playthrough.',
    );
  const definition = compiled.definition.encounters.find((item) => item.id === command.encounterId);
  if (!definition)
    return rejectGameplay(
      state,
      'invalid-command',
      'The requested encounter definition does not exist.',
    );
  const missingOutcome = requiredOutcomes(definition).find(
    (outcome) => !definition.outcomeMappings.some((mapping) => mapping.outcome === outcome),
  );
  if (missingOutcome)
    return rejectGameplay(
      state,
      'invalid-definition',
      'Encounter is missing the required ' + missingOutcome + ' outcome mapping.',
    );
  if (definition.victoryRewards) {
    const preflightDraft = cloneGameplayValue(state) as GameplayDraft;
    const preflightFailure = applyGrantToDraft(
      compiled,
      preflightDraft,
      victoryGrant(state, command.instanceId, definition),
    );
    if (preflightFailure)
      return rejectGameplay(
        state,
        preflightFailure.code,
        'Victory reward preflight failed: ' + preflightFailure.message,
      );
  }

  const draft = cloneGameplayValue(state) as GameplayDraft;
  const combatants: DraftCombatant[] = definition.participants.map((participant) => {
    const character = compiled.definition.characters.find(
      (item) => item.id === participant.characterId,
    )!;
    const resources: Record<string, number> = {};
    for (const resource of compiled.definition.resources) {
      resources[resource.id] = character.startingResources?.[resource.id] ?? resource.defaultValue;
    }
    return {
      id: participant.id,
      characterId: participant.characterId,
      team: participant.team,
      position: { ...participant.position },
      resources,
      statuses: [],
      cooldowns: {},
      completedTurns: 0,
    };
  });
  const first = orderedParticipants(definition)[0]!;
  draft.encounter = {
    instanceId: command.instanceId,
    definitionId: definition.id,
    round: 1,
    activeParticipantId: first.id,
    combatants,
    outcome: null,
  };
  if (!advanceRevision(draft))
    return rejectGameplay(state, 'revision-overflow', 'Gameplay revision cannot advance safely.');
  if (!advanceUntilPlayer(compiled, draft, definition))
    return rejectGameplay(state, 'revision-overflow', 'Gameplay revision cannot advance safely.');
  return acceptedSnapshot(draft, 'encounter-started');
}

function takePlayerTurn(
  compiled: CompiledGameplay,
  state: GameplayState,
  command: Extract<GameplayCommand, { type: 'move' | 'use-ability' | 'wait' | 'withdraw' }>,
): GameplayTransitionResult {
  const encounter = state.encounter;
  if (!encounter)
    return rejectGameplay(state, 'encounter-inactive', 'There is no active encounter.');
  if (encounter.outcome !== null)
    return rejectGameplay(state, 'terminal-encounter', 'This encounter has already ended.');
  if (
    !isSafeId(command.encounterInstanceId) ||
    command.encounterInstanceId !== encounter.instanceId
  )
    return rejectGameplay(
      state,
      'wrong-encounter-instance',
      'Command belongs to another encounter instance.',
    );
  if (command.type !== 'withdraw' && encounter.activeParticipantId !== command.participantId)
    return rejectGameplay(state, 'invalid-turn', 'It is not this participant’s turn.');
  const active = encounter.combatants.find(
    (participant) => participant.id === encounter.activeParticipantId,
  );
  if (!active || active.team !== 'player')
    return rejectGameplay(state, 'invalid-turn', 'Only a player turn may accept this command.');

  if (command.type === 'withdraw') {
    const definition = encounterDefinition(compiled, encounter);
    if (!definition?.allowWithdrawal)
      return rejectGameplay(
        state,
        'invalid-transition',
        'This encounter does not allow withdrawal.',
      );
  }

  const draft = cloneGameplayValue(state) as GameplayDraft;
  const draftEncounter = draft.encounter!;
  const actor = draftEncounter.combatants.find(
    (participant) => participant.id === draftEncounter.activeParticipantId,
  )!;
  const turnRevision = draft.revision;
  const actionFailure = applyPlayerIntent(compiled, draft, command as GameplayPlayerIntent);
  if (actionFailure) return rejectGameplay(state, actionFailure.code, actionFailure.message);

  if (draftEncounter.outcome === null) {
    const definition = encounterDefinition(compiled, draftEncounter)!;
    completeTurn(
      draft,
      actor,
      turnRevision,
      command.type === 'use-ability' ? command.abilityId : undefined,
    );
    determineOutcome(draftEncounter, compiled.definition.healthResourceId);
    if (draftEncounter.outcome === null)
      advanceTurn(draft, definition, compiled.definition.healthResourceId);
  }
  if (!advanceRevision(draft))
    return rejectGameplay(state, 'revision-overflow', 'Gameplay revision cannot advance safely.');
  if (
    draftEncounter.outcome === null &&
    !advanceUntilPlayer(compiled, draft, encounterDefinition(compiled, draftEncounter)!)
  )
    return rejectGameplay(state, 'revision-overflow', 'Gameplay revision cannot advance safely.');
  const outcomeFailure = resolveOutcome(compiled, draft);
  if (outcomeFailure) return rejectGameplay(state, outcomeFailure.code, outcomeFailure.message);
  return acceptedSnapshot(draft, command.type);
}

function applyPlayerIntent(
  compiled: CompiledGameplay,
  draft: GameplayDraft,
  command: GameplayPlayerIntent,
): { code: GameplayRejectionCode; message: string } | null {
  const encounter = draft.encounter!;
  const actor = encounter.combatants.find(
    (participant) => participant.id === encounter.activeParticipantId,
  )!;
  switch (command.type) {
    case 'move': {
      if (!validCell(command.destination))
        return { code: 'illegal-move', message: 'Destination is not a valid board cell.' };
      const definition = encounterDefinition(compiled, encounter)!;
      const board = compiled.definition.boards.find((item) => item.id === definition.boardId)!;
      const path = findPath(board, encounter.combatants, actor, command.destination);
      const movement =
        getEffectiveCharacterAttributes(
          compiled,
          draft as GameplayState,
          actor.characterId,
          actor.id,
        )[compiled.definition.movementAttributeId] ?? 0;
      if (!path || path.length - 1 < 1 || path.length - 1 > movement)
        return {
          code: 'illegal-move',
          message: 'Destination must be reachable within ' + movement + ' four-direction steps.',
        };
      actor.position = { ...command.destination };
      return null;
    }
    case 'wait':
      return null;
    case 'withdraw': {
      encounter.outcome = 'withdrawn';
      return null;
    }
    case 'use-ability':
      return applyAbility(compiled, draft, actor, command);
    default:
      return {
        code: 'invalid-command',
        message: 'This command is not a player combat intent.',
      };
  }
}

function applyAbility(
  compiled: CompiledGameplay,
  draft: GameplayDraft,
  actor: DraftCombatant,
  command: Extract<GameplayPlayerIntent, { type: 'use-ability' }>,
): { code: GameplayRejectionCode; message: string } | null {
  if (!isSafeId(command.abilityId))
    return { code: 'invalid-command', message: 'Ability ID is invalid.' };
  const ability = compiled.definition.abilities.find((item) => item.id === command.abilityId);
  if (!ability) return { code: 'ability-unavailable', message: 'Ability is not defined.' };
  const unlocked = new Set(
    getUnlockedAbilityIds(compiled, draft as GameplayState, actor.characterId),
  );
  for (const itemId of Object.values(draft.equipment[actor.characterId] ?? {})) {
    const item = compiled.definition.items.find((candidate) => candidate.id === itemId);
    for (const grantedId of item?.equipment?.grantedAbilityIds ?? []) unlocked.add(grantedId);
  }
  if (!unlocked.has(ability.id))
    return {
      code: 'ability-unavailable',
      message: 'This character has not unlocked the ability.',
    };
  if ((actor.cooldowns[ability.id] ?? 0) > 0)
    return { code: 'ability-unavailable', message: 'This ability is still recovering.' };

  const attributes = getEffectiveCharacterAttributes(
    compiled,
    draft as GameplayState,
    actor.characterId,
    actor.id,
  );
  if (
    (ability.requirements ?? []).some(
      (requirement) =>
        (attributes[requirement.attributeId] ?? Number.MIN_SAFE_INTEGER) < requirement.minimum,
    )
  )
    return { code: 'ability-unavailable', message: 'Ability requirements are not met.' };

  const target = resolveTarget(compiled, draft, actor, ability.target.kind, command);
  if (!target.ok)
    return {
      code: 'illegal-target',
      message: 'The selected target is not valid for this ability.',
    };
  const targetCell = command.targetCell;
  const position = target.participant?.position ?? targetCell;
  const distance = position ? manhattan(actor.position, position) : -1;
  if (distance < ability.target.minimumRange || distance > ability.target.maximumRange)
    return { code: 'illegal-target', message: 'The target is outside this ability’s range.' };

  for (const [resourceId, cost] of Object.entries(ability.resourceCosts)) {
    if ((actor.resources[resourceId] ?? 0) < cost)
      return {
        code: 'insufficient-resource',
        message: 'Not enough ' + resourceId + ' to use ' + ability.id + '.',
      };
  }
  for (const [resourceId, cost] of Object.entries(ability.resourceCosts))
    actor.resources[resourceId] = actor.resources[resourceId]! - cost;

  const recipients = target.participant
    ? [target.participant]
    : draft.encounter!.combatants.filter(
        (participant) =>
          participant.position.x === targetCell!.x && participant.position.y === targetCell!.y,
      );
  if (recipients.length === 0)
    return { code: 'illegal-target', message: 'The selected cell has no valid target.' };
  const actionRevision = draft.revision;
  for (const effect of ability.effects) {
    for (const recipient of recipients) {
      switch (effect.op) {
        case 'damage': {
          const health = compiled.definition.healthResourceId;
          recipient.resources[health] = Math.max(
            0,
            (recipient.resources[health] ?? 0) - effect.amount,
          );
          break;
        }
        case 'heal': {
          const health = compiled.definition.healthResourceId;
          const maximum =
            compiled.definition.resources.find((resource) => resource.id === health)?.maximum ?? 0;
          recipient.resources[health] = addCapped(
            recipient.resources[health] ?? 0,
            effect.amount,
            maximum,
          );
          break;
        }
        case 'restore-resource': {
          const maximum =
            compiled.definition.resources.find((resource) => resource.id === effect.resourceId)
              ?.maximum ?? 0;
          recipient.resources[effect.resourceId] = addCapped(
            recipient.resources[effect.resourceId] ?? 0,
            effect.amount,
            maximum,
          );
          break;
        }
        case 'apply-status': {
          const status = compiled.definition.statusEffects.find(
            (candidate) => candidate.id === effect.statusEffectId,
          )!;
          const existing = recipient.statuses.find(
            (instance) => instance.statusEffectId === status.id,
          );
          if (!existing) {
            recipient.statuses.push({
              statusEffectId: status.id,
              remainingHolderTurns: status.durationTurns,
              appliedAtRevision: actionRevision,
            });
          } else if (status.stackingPolicy === 'refresh') {
            existing.remainingHolderTurns = status.durationTurns;
            existing.appliedAtRevision = actionRevision;
          }
          break;
        }
      }
    }
  }
  if (ability.cooldownTurns !== undefined && ability.cooldownTurns > 0)
    actor.cooldowns[ability.id] = ability.cooldownTurns;
  return null;
}

function resolveTarget(
  compiled: CompiledGameplay,
  draft: GameplayDraft,
  actor: DraftCombatant,
  kind: 'self' | 'ally' | 'enemy' | 'cell',
  command: Extract<GameplayPlayerIntent, { type: 'use-ability' }>,
): { ok: true; participant?: DraftCombatant } | { ok: false } {
  if (kind === 'cell') {
    const board = compiled.definition.boards.find(
      (item) => item.id === encounterDefinition(compiled, draft.encounter!)?.boardId,
    );
    return validCell(command.targetCell) && board && withinBoard(command.targetCell, board)
      ? { ok: true }
      : { ok: false };
  }
  if (!isSafeId(command.targetParticipantId)) return { ok: false };
  const participant = draft.encounter!.combatants.find(
    (item) => item.id === command.targetParticipantId,
  );
  if (!participant || (participant.resources[compiled.definition.healthResourceId] ?? 0) <= 0)
    return { ok: false };
  const valid =
    kind === 'self'
      ? participant.id === actor.id
      : kind === 'ally'
        ? participant.team === actor.team
        : participant.team !== actor.team;
  return valid ? { ok: true, participant } : { ok: false };
}

function advanceUntilPlayer(
  compiled: CompiledGameplay,
  draft: GameplayDraft,
  definition: GameplayEncounterDefinition,
): boolean {
  let processed = 0;
  while (
    draft.encounter?.outcome === null &&
    draft.encounter.combatants.find(
      (participant) => participant.id === draft.encounter!.activeParticipantId,
    )?.team === 'enemy'
  ) {
    if (processed++ >= definition.participants.length || draft.revision >= Number.MAX_SAFE_INTEGER)
      return false;
    const actor = draft.encounter!.combatants.find(
      (participant) => participant.id === draft.encounter!.activeParticipantId,
    )!;
    const baseRevision = draft.revision;
    const selected = chooseEnemyIntent(compiled, draft, actor, definition);
    const internalCommand = {
      playthroughId: draft.playthroughId,
      encounterInstanceId: draft.encounter!.instanceId,
      expectedRevision: baseRevision,
      intent: selected,
    };
    if (!isCurrentInternalCommand(draft, actor, internalCommand)) return false;
    let failure = applyPlayerIntent(compiled, draft, selected);
    let executed = selected;
    if (failure) {
      const fallback: GameplayPlayerIntent = { type: 'wait', participantId: actor.id };
      failure = applyPlayerIntent(compiled, draft, fallback);
      executed = fallback;
    }
    if (failure) return false;
    completeTurn(
      draft,
      actor,
      baseRevision,
      executed.type === 'use-ability' ? executed.abilityId : undefined,
    );
    determineOutcome(draft.encounter!, compiled.definition.healthResourceId);
    if (draft.encounter!.outcome === null)
      advanceTurn(draft, definition, compiled.definition.healthResourceId);
    draft.revision += 1;
  }
  return true;
}

function chooseEnemyIntent(
  compiled: CompiledGameplay,
  draft: GameplayDraft,
  actor: DraftCombatant,
  definition: GameplayEncounterDefinition,
): GameplayPlayerIntent {
  const opponents = draft
    .encounter!.combatants.filter(
      (participant) =>
        participant.team !== actor.team &&
        (participant.resources[compiled.definition.healthResourceId] ?? 0) > 0,
    )
    .sort((left, right) => compareIds(left.id, right.id));
  const abilities = [...compiled.definition.abilities]
    .filter(
      (ability) =>
        ability.target.kind === 'enemy' &&
        ability.effects.some((effect) => effect.op === 'damage' && effect.amount > 0),
    )
    .sort((left, right) => compareIds(left.id, right.id));
  const attackTargets = [...opponents].sort(
    (left, right) =>
      manhattan(actor.position, left.position) - manhattan(actor.position, right.position) ||
      compareIds(left.id, right.id),
  );
  for (const ability of abilities) {
    for (const target of attackTargets) {
      const intent: GameplayPlayerIntent = {
        type: 'use-ability',
        participantId: actor.id,
        abilityId: ability.id,
        targetParticipantId: target.id,
      };
      const probe = cloneGameplayValue(draft) as GameplayDraft;
      if (!applyPlayerIntent(compiled, probe, intent)) return intent;
    }
  }

  if (opponents.some((target) => manhattan(actor.position, target.position) === 1))
    return { type: 'wait', participantId: actor.id };
  const board = compiled.definition.boards.find((item) => item.id === definition.boardId)!;
  const paths: Array<{ targetId: string; path: GameplayCell[]; directionOrder: number }> = [];
  for (const target of opponents) {
    DIRECTIONS.forEach((direction, directionOrder) => {
      const destination = {
        x: target.position.x + direction.x,
        y: target.position.y + direction.y,
      };
      const path = findPath(board, draft.encounter!.combatants, actor, destination);
      if (path && path.length > 1) paths.push({ targetId: target.id, path, directionOrder });
    });
  }
  paths.sort(
    (left, right) =>
      left.path.length - right.path.length ||
      compareIds(left.targetId, right.targetId) ||
      left.directionOrder - right.directionOrder,
  );
  const selectedPath = paths[0]?.path;
  if (!selectedPath) return { type: 'wait', participantId: actor.id };
  const movement =
    getEffectiveCharacterAttributes(compiled, draft as GameplayState, actor.characterId, actor.id)[
      compiled.definition.movementAttributeId
    ] ?? 1;
  const destination = selectedPath[Math.min(movement, selectedPath.length - 1)]!;
  return { type: 'move', participantId: actor.id, destination };
}

function isCurrentInternalCommand(
  draft: GameplayDraft,
  actor: DraftCombatant,
  command: {
    readonly playthroughId: string;
    readonly encounterInstanceId: string;
    readonly expectedRevision: number;
    readonly intent: GameplayPlayerIntent;
  },
): boolean {
  return (
    draft.encounter !== null &&
    draft.encounter.outcome === null &&
    command.playthroughId === draft.playthroughId &&
    command.encounterInstanceId === draft.encounter.instanceId &&
    command.expectedRevision === draft.revision &&
    draft.encounter.activeParticipantId === actor.id &&
    actor.team === 'enemy' &&
    'participantId' in command.intent &&
    command.intent.participantId === actor.id
  );
}

function advanceTurn(
  draft: GameplayDraft,
  definition: GameplayEncounterDefinition,
  healthResourceId: string,
): void {
  const encounter = draft.encounter!;
  const ordered = orderedParticipants(definition);
  const currentIndex = ordered.findIndex(
    (participant) => participant.id === encounter.activeParticipantId,
  );
  for (let offset = 1; offset <= ordered.length; offset += 1) {
    const index = (currentIndex + offset) % ordered.length;
    const candidate = encounter.combatants.find((item) => item.id === ordered[index]!.id)!;
    if ((candidate.resources[healthResourceId] ?? 0) <= 0) continue;
    if (index <= currentIndex) {
      if (encounter.round >= definition.maxTurns) {
        encounter.outcome = 'turn-limit';
        return;
      }
      encounter.round += 1;
    }
    encounter.activeParticipantId = candidate.id;
    return;
  }
}

function completeTurn(
  _draft: GameplayDraft,
  actor: DraftCombatant,
  actionRevision: number,
  usedAbilityId?: string,
): void {
  actor.completedTurns += 1;
  for (const status of [...actor.statuses]) {
    if (status.appliedAtRevision === actionRevision) continue;
    status.remainingHolderTurns -= 1;
    if (status.remainingHolderTurns <= 0) actor.statuses.splice(actor.statuses.indexOf(status), 1);
  }
  for (const [abilityId, turns] of Object.entries(actor.cooldowns)) {
    if (abilityId === usedAbilityId) continue;
    const remaining = Math.max(0, turns - 1);
    if (remaining === 0) delete actor.cooldowns[abilityId];
    else actor.cooldowns[abilityId] = remaining;
  }
}

function determineOutcome(encounter: DraftEncounter, healthResourceId: string): void {
  if (encounter.outcome !== null) return;
  const playersAlive = encounter.combatants.some(
    (participant) =>
      participant.team === 'player' && (participant.resources[healthResourceId] ?? 0) > 0,
  );
  const enemiesAlive = encounter.combatants.some(
    (participant) =>
      participant.team === 'enemy' && (participant.resources[healthResourceId] ?? 0) > 0,
  );
  if (!enemiesAlive) encounter.outcome = 'victory';
  else if (!playersAlive) encounter.outcome = 'defeat';
}

function resolveOutcome(
  compiled: CompiledGameplay,
  draft: GameplayDraft,
): { code: GameplayRejectionCode; message: string } | null {
  const encounter = draft.encounter;
  if (!encounter || encounter.outcome === null) return null;
  if (draft.outcomeMarkers.some((marker) => marker.encounterInstanceId === encounter.instanceId))
    return {
      code: 'invalid-transition',
      message: 'This encounter instance already has a terminal outcome marker.',
    };
  const definition = encounterDefinition(compiled, encounter);
  const mapping = definition?.outcomeMappings.find(
    (candidate) => candidate.outcome === encounter.outcome,
  );
  if (!definition || !mapping)
    return {
      code: 'invalid-definition',
      message: 'The terminal outcome has no authored application consequence mapping.',
    };
  if (encounter.outcome === 'victory' && definition.victoryRewards) {
    const rewardFailure = applyGrantToDraft(
      compiled,
      draft,
      victoryGrant(draft as GameplayState, encounter.instanceId, definition),
    );
    if (rewardFailure)
      return {
        code: rewardFailure.code,
        message: 'Victory reward could not be committed: ' + rewardFailure.message,
      };
  }
  draft.outcomeMarkers.push({
    encounterInstanceId: encounter.instanceId,
    outcome: encounter.outcome,
    consequenceId: mapping.consequenceId,
  });
  return null;
}

function victoryGrant(
  state: GameplayState,
  instanceId: string,
  definition: GameplayEncounterDefinition,
): GameplayGrantCommand {
  return {
    playthroughId: state.playthroughId,
    expectedRevision: state.revision,
    rewardId: 'encounter:' + instanceId + ':victory',
    ...definition.victoryRewards,
  };
}

function requiredOutcomes(definition: GameplayEncounterDefinition): GameplayOutcome[] {
  return definition.allowWithdrawal
    ? ['victory', 'defeat', 'turn-limit', 'withdrawn']
    : ['victory', 'defeat', 'turn-limit'];
}

function findPath(
  board: {
    readonly width: number;
    readonly height: number;
    readonly blockedCells: readonly GameplayCell[];
  },
  combatants: readonly GameplayCombatantState[],
  actor: GameplayCombatantState,
  destination: GameplayCell,
): GameplayCell[] | null {
  if (!withinBoard(destination, board)) return null;
  const blocked = new Set(board.blockedCells.map(cellKey));
  const occupied = new Set(
    combatants
      .filter((participant) => participant.id !== actor.id)
      .map((participant) => cellKey(participant.position)),
  );
  const target = cellKey(destination);
  if (blocked.has(target) || occupied.has(target)) return null;
  const queue: GameplayCell[][] = [[actor.position]];
  const visited = new Set([cellKey(actor.position)]);
  while (queue.length) {
    const path = queue.shift()!;
    const current = path[path.length - 1]!;
    if (cellKey(current) === target) return path;
    for (const direction of DIRECTIONS) {
      const next = { x: current.x + direction.x, y: current.y + direction.y };
      const key = cellKey(next);
      if (!withinBoard(next, board) || blocked.has(key) || occupied.has(key) || visited.has(key))
        continue;
      visited.add(key);
      queue.push([...path, next]);
    }
  }
  return null;
}

function orderedParticipants(
  definition: GameplayEncounterDefinition,
): GameplayEncounterDefinition['participants'][number][] {
  return [...definition.participants].sort(
    (left, right) => right.initiative - left.initiative || compareIds(left.id, right.id),
  );
}

function encounterDefinition(
  compiled: CompiledGameplay,
  encounter: GameplayEncounterState,
): GameplayEncounterDefinition | undefined {
  return compiled.definition.encounters.find((item) => item.id === encounter.definitionId);
}

function advanceRevision(draft: GameplayDraft): boolean {
  if (
    !Number.isSafeInteger(draft.revision) ||
    draft.revision < 0 ||
    draft.revision >= Number.MAX_SAFE_INTEGER
  )
    return false;
  draft.revision += 1;
  return true;
}

function acceptedSnapshot(draft: GameplayDraft, change: string): GameplayTransitionResult {
  return { accepted: true, state: snapshotGameplayState(draft), change };
}

function validCell(value: unknown): value is GameplayCell {
  return (
    typeof value === 'object' &&
    value !== null &&
    Number.isSafeInteger((value as GameplayCell).x) &&
    Number.isSafeInteger((value as GameplayCell).y)
  );
}

function withinBoard(
  cell: GameplayCell,
  board: { readonly width: number; readonly height: number },
): boolean {
  return cell.x >= 0 && cell.y >= 0 && cell.x < board.width && cell.y < board.height;
}

function cellKey(cell: GameplayCell): string {
  return String(cell.x) + ',' + String(cell.y);
}

function manhattan(left: GameplayCell, right: GameplayCell): number {
  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y);
}

function addCapped(current: number, amount: number, maximum: number): number {
  const available = maximum - current;
  return amount >= available ? maximum : current + amount;
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isSafeId(value: unknown): value is string {
  return typeof value === 'string' && SAFE_ID.test(value);
}
