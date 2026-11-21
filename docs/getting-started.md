# Getting started

## Running the game

Use Node.js `>=22.22.2 <23` and npm `>=10 <11` for the root workspace and its
build tools. The standalone `waypoint-rpg-core` runtime supports Node.js
`>=22.0.0`; this lower consumer floor does not apply to the app toolchain.

```bash
npm ci
npm run dev          # Vite dev server
npm run dev:linked   # package watch build + Vite for live framework edits
npm run build        # production build (content validation + bundle budgets + deploy shape)
npm run preview      # serve the built dist/
npm run verify       # format + lint + typecheck + unit tests + build — the full gate
npx playwright test  # e2e (serial, ~2h; needs `npx playwright install chromium` once)
```

The game is a Persian RTL turn-based RPG for ages 3–7 (mahalle-ye-mehrabani).
Useful URL flags: `?research=0` skips the consent gate, `?perfprobe=1` installs
the performance probe, `?worldbuilder=1` opens the authoring tool,
`?kidtest=nocopy,noactionicons` strips copy/non-physical affordances for
comprehension testing. Docs map: `AGENTS.md` §10.

## Consuming the framework

`packages/core/` is the reusable, dependency-free ESM package containing the
game-agnostic primitives and `createGameRuntime` state-machine seam. Import its
public API from `waypoint-rpg-core`; deep imports are rejected. The Kids RPG
routes its imports through `src/framework/index.ts`, which adds game-owned
camera, quality, and optional battle APIs. API reference:
[framework-api.md](framework-api.md). Extraction rationale:
[framework-extraction.md](framework-extraction.md).

Minimal consumer — the shipped `examples/hello-world/` is the canonical
walkthrough and the API's validation consumer:

```ts
import { createGameRuntime } from 'waypoint-rpg-core';
import type { GameRuntimeAdapter } from 'waypoint-rpg-core';

type State = { phase: 'idle' | 'celebrated'; taps: number; lastTapAt: number };
type Command = { type: 'tap-prop' } | { type: 'settle' };

const adapter: GameRuntimeAdapter<State, Command> = {
  createInitialState: () => ({ phase: 'idle', taps: 0, lastTapAt: 0 }),
  reducer: (state, command, context) => {
    if (command.type === 'tap-prop') {
      return { ...state, phase: 'celebrated', taps: state.taps + 1, lastTapAt: context.now };
    }
    return { ...state, phase: 'idle' };
  },
};

const runtime = createGameRuntime(adapter); // or createGameRuntime(adapter, { clock })
runtime.subscribe((state) => render(state));
runtime.dispatch({ type: 'tap-prop' });
```

Contract in three lines:

- `createInitialState()` seeds the store once — hydration is the _consumer's_
  job, dispatched through the reducer itself (the runtime never hydrates).
- `reducer(state, command, context)` is the only transition mechanism;
  `context.now` is the injected clock — timestamp through it, never `Date.now()`.
- The runtime is a state machine only. Persistence is a separate
  `PersistenceAdapter<P>` consumed by _your_ coordinators (load/save
  eligibility, scopes, failure policy all stay application-side).

Run the example:

```bash
npm run example:dev    # dev server for examples/hello-world
npm run example:build  # build to examples/hello-world/dist (excluded from the game bundle + precache)
```

## What stays in your app

World content (`WorldMap`/`WorldArea`/`GraphSource` declarations), persisted
schema + migrations, copy/content, UI, save/boot policy. The framework owns
lifecycle and subscriptions; it never decides what a command means or when a
save is allowed.

## Rules that apply to consumers too

- The Kids RPG imports package APIs through its `src/framework/index.ts`
  facade; application lint rejects direct package and deep source imports.
- Independent consumers import only `waypoint-rpg-core`, the package root.
- Game content must never be imported by framework code; app types _extend_
  the primitives (`labelFa`, `environment`, schedules stay app-side).
- `disposal={null}` on shared resources; scene-unique disposables are counted
  by `DisposalProbe` across remounts.
