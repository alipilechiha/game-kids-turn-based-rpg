import { transitionGameplay } from 'waypoint-rpg-gameplay';
import { describe, expect, it } from 'vitest';
import {
  createAnimationGameplayDemo,
  createAnimationMoveCommand,
  projectGameplayAnimationChanges,
} from './gameplay-demo.js';

describe('gameplay animation projection', () => {
  it('maps accepted player and deterministic enemy movement to their own move actions', () => {
    const demo = createAnimationGameplayDemo('animation-projection-test');
    const command = createAnimationMoveCommand(demo.state);
    const result = transitionGameplay(demo.compiled, demo.state, command);

    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.state.revision).toBe(demo.state.revision + 2);
    expect(result.state.encounter?.combatants.map(({ id, position }) => [id, position.x])).toEqual([
      ['traveler', 1],
      ['guardian', 5],
    ]);
    expect(projectGameplayAnimationChanges(demo.state, result, command)).toEqual({
      traveler: 'move',
      guardian: 'move',
    });
  });

  it('does not project a stale rejected command as an animation', () => {
    const demo = createAnimationGameplayDemo('animation-stale-command-test');
    const command = createAnimationMoveCommand(demo.state);
    const accepted = transitionGameplay(demo.compiled, demo.state, command);
    expect(accepted.accepted).toBe(true);
    if (!accepted.accepted) return;

    const stale = transitionGameplay(demo.compiled, accepted.state, command);
    expect(stale.accepted).toBe(false);
    expect(stale.state).toBe(accepted.state);
    expect(projectGameplayAnimationChanges(accepted.state, stale, command)).toEqual({});
  });
});
