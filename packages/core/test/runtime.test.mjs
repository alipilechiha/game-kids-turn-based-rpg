import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameRuntime } from '../dist/index.js';

test('runtime keeps the injected clock, pause/resume, and disposal contract', () => {
  const runtime = createGameRuntime(
    {
      createInitialState: () => ({ count: 0, now: 0 }),
      reducer: (state, command, context) => ({ count: state.count + command, now: context.now }),
    },
    { clock: () => 42 },
  );
  const notifications = [];
  runtime.subscribe((state) => notifications.push(state));

  assert.deepEqual(runtime.getState(), { count: 0, now: 0 });
  runtime.dispatch(1);
  runtime.pause();
  runtime.dispatch(2);
  assert.deepEqual(notifications, [{ count: 1, now: 42 }]);

  runtime.resume();
  assert.deepEqual(notifications, [
    { count: 1, now: 42 },
    { count: 3, now: 42 },
  ]);

  runtime.dispose();
  runtime.dispatch(5);
  assert.deepEqual(runtime.getState(), { count: 3, now: 42 });
  assert.equal(notifications.length, 2);
});

test('emitted root contains only the approved runtime values', async () => {
  const api = await import('../dist/index.js');
  assert.deepEqual(Object.keys(api).sort(), [
    'anchorForLandmark',
    'anchorForNpc',
    'createGameRuntime',
    'distanceBetween',
    'findPath',
    'getAnchor',
    'getAnchorOrNull',
    'insideBounds',
    'nearestWalkableAnchor',
    'neighboursOf',
    'pathToPoints',
  ]);
});
