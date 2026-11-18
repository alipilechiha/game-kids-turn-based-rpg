# Framework API

`packages/core/` is the reusable, renderer-independent ESM package:
identifiers, world DTOs, graph/pathfinding, the injected runtime, and generic
persistence contracts. Its only public entry is the `waypoint-rpg-core`
package root; package-side checks reject external dependencies and deep
imports. The Kids RPG composes that API with game-owned capabilities, quality
policy, camera math, and battle modules through `src/framework/index.ts`.
Application imports use this facade; `examples/hello-world` and independent
consumers import the package root directly.

> Phase 1 delivers a reusable core library, not a complete Three.js RPG
> engine. `examples/hello-world` verifies the workspace consumer path; the
> separately installed tarball fixture verifies package isolation, exports,
> declarations, runtime behavior, and browser bundling. Registry publication
> is deferred.

## Compatibility boundaries

- **Core runtime:** Node.js `>=22.0.0`; CI executes the packed package on
  Node.js 22.0.0 with no browser globals.
- **Root build and development tools:** Node.js `>=22.22.2 <23` and npm
  `>=10 <11`; application CI pins Node.js 22.22.2. The locked Vite,
  TypeScript, tests, and package scripts are exercised on this toolchain.
- **Offline package installation:** the tarball has no runtime dependencies
  and installs from a local artifact with an empty npm cache. This does not
  claim that Vite or TypeScript can be newly installed offline.
- **Development-tool installation:** root and consumer toolchains install from
  their lockfiles with `npm ci`; an offline tools install requires a populated
  npm cache.
- **Browser execution:** Chromium is exercised in the package consumer and
  app Playwright checks. No compatibility claim is made for other browsers or
  physical hardware.

## Export status (audit — who validates what)

| Export group                                                                                                                           | Kids RPG app              | hello-world | Independent tarball consumer                                               |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ----------- | -------------------------------------------------------------------------- |
| Core identifiers, world DTOs, graph/pathfinding, runtime and persistence contracts                                                     | ✓ via app facade          | ✓           | ✓ Node runtime, NodeNext/Bundler types, Vite bundle and Chromium execution |
| Quality/capabilities                                                                                                                   | ✓ (app-owned facade)      | —           | Not in the core package                                                    |
| Camera math (`three/`)                                                                                                                 | ✓ (app-owned facade)      | —           | Not in the core package; validate with a 3D consumer in Phase 2            |
| Battle module (`createBattle`/`chooseBattleAction`/`advanceBattlePhase`/`enemyIntentFor`, `battleReducer`, `validateBattleDefinition`) | ✓ (app-owned)             | —           | Optional game module, not in the core package                              |
| `perfProbe`                                                                                                                            | loaded via dynamic import | —           | Deliberately not re-exported — lazy chunk, precache-excluded               |

The package root exports only the approved generic core API. The app facade
also exports game-owned optional surfaces; these do not become core-package
dependencies. A separate 3D game consumer begins in the renderer and narrative
roadmap phases.

## Ownership model

| Layer                            | Owns                                                                                                      | Never does                                  |
| -------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `createGameRuntime`              | one store, dispatch plumbing (`ReducerContext.now` per command), subscribe/getState, pause/resume/dispose | interpret state, persist, hydrate app state |
| `GameRuntimeAdapter<S, C>` (app) | `createInitialState()` (boot state), the reducer                                                          | persistence, side effects                   |
| Application coordinators (app)   | hydration order, profile/slot selection, save scheduling, failure policy                                  | bypass the reducer                          |
| `PersistenceAdapter<P>` (app)    | scoped `load`/`save`, `onFailure` → `StorageFallback`                                                     | decide save timing (coordinators do)        |

Hydration is ordinary commands: runtime boots with `createInitialState()`,
then the app's coordinator loads its index/saves and dispatches its own
boot/profile commands through the reducer. Nothing duplicates or skips
reducer semantics.

## `createGameRuntime<S, C>(adapter, config?)`

```ts
interface GameRuntimeAdapter<S, C> {
  createInitialState(): S;
  reducer: (state: S, command: C, context: ReducerContext): S;
}
interface ReducerContext {
  readonly now: number; // stamped by the runtime's clock on EVERY dispatch
}
interface GameRuntimeConfig {
  readonly clock?: () => number; // inject a fixed clock for replay/tests
}
interface GameRuntime<S, C> {
  getState(): S;
  dispatch(command: C): S;
  subscribe(listener: (state: S) => void): () => void;
  pause(): void; // suspends notification; state still advances
  resume(): void; // one flush with current state
  readonly paused: boolean;
  dispose(): void;
}
```

React binding pattern (see `src/app/GameProvider.tsx`):
`useSyncExternalStore(runtime.subscribe, runtime.getState)`; the runtime is
created once (e.g. `useState` initializer) and never disposed by a simulated
StrictMode unmount.

## `PersistenceAdapter<P>`

```ts
interface SaveScope {
  readonly slotKey: string;
}
type LoadResult<P> = { kind: 'loaded'; data: P } | { kind: 'empty' } | { kind: 'corrupt' }; // NO payload — a bad save can't masquerade as data
type PersistenceFailure = { kind: 'corrupt' } | { kind: 'unavailable' } | { kind: 'quota' };
type StorageFallback = { kind: 'memory'; authoritative: boolean } | { kind: 'none' };
interface PersistenceAdapter<P> {
  load(scope: SaveScope): Promise<LoadResult<P>>;
  save(data: P, scope: SaveScope): Promise<void>;
  onFailure(kind: PersistenceFailure): StorageFallback;
}
```

The runtime does **not** consume this — the application's coordinators do
(`ProfileCoordinator`/`SaveCoordinator` in `src/app/`). Scoped slots mirror
per-profile save keys; the `corrupt` branch carries no data by design.

## World primitives

`Anchor`, `Edge`, `Bounds`, `WorldArea`, `WorldMap`, `MapTransition`,
`NpcPlacement` (`packages/core/src/world.ts`) + branded ids
(`packages/core/src/identifiers.ts`) +
`insideBounds`, `GraphSource` helpers (`getAnchor`, `neighboursOf`,
`anchorForNpc`, `anchorForLandmark`, `distanceBetween`) + `findPath` /
`nearestWalkableAnchor` / `pathToPoints`. Navigation is a declared anchor
graph — no physics engine. Application fields (`labelFa`, environment,
schedules) extend these; they are not part of the primitives.

## Quality + capabilities

`QualityTier`, `detectQualityTier`, `maxPixelRatioFor`, `detectWebgl`,
`currentOrientation`, `prefersReducedMotion`.

## Camera math (`three/`)

Pure math only: `ISO_OFFSET`, zoom clamps (`clampZoom`, `clampUserZoom`,
`MIN_ZOOM`/`MAX_ZOOM`/`DEFAULT_ZOOM`), `clampCameraTarget`,
`resolveCameraSource`, `shouldApplyPan`, focus-override types. No renderer
objects — the app's `CameraRig` consumes them.

## Optional module: battle

`src/framework/modules/battle/` — `createBattle`, `chooseBattleAction`,
`advanceBattlePhase`, `battleReducer`, `validateBattleDefinition` + types.
Reusable, not required by a consumer.

## `examples/hello-world` — the workspace consumer

`examples/hello-world/` builds with its own `vite.config.ts` into
`examples/hello-world/dist` (gitignored) — deliberately outside the game's
bundle so the "absent from budget and precache" checks in
`scripts/check-deploy.ts` are verifications, not assumptions.

```bash
npm run example:dev    # serve the example
npm run example:build  # build it (part of npm run verify)
```

It imports `waypoint-rpg-core` from the npm workspace link and exercises end to
end: `createGameRuntime` with its own `HelloState`
(5-line reducer), fixed-clock dispatch, subscribe/pause/resume/dispose,
`PersistenceAdapter` memory round-trip, `GraphSource`/`getAnchor`/
`insideBounds` on a ~30-line declared world — **no React, no Three, no game
content**. `hello-world.test.ts` is the consumer-side contract suite; the
app-side split lives in `src/app/runtimeCoordinator.test.ts` (runtime
contract vs coordinator behavior).

For package source edits while developing the game, use `npm run dev:linked`.
It starts one package TypeScript watch process, waits for the first successful
emit, then starts Vite. Vite's standard linked-package resolution is used; no
`optimizeDeps.exclude`, `preserveSymlinks`, or custom resolver override is
configured. `npm run verify` builds the package once before its prepared app
stages.

## Lifecycle probes (dev/`__WORLD_PROBE` only)

- `__worldDisposeEvents` — counted `dispose` events on scene-owned
  geometries/materials/textures. A remount must grow it; idle frames must
  not. (`DisposalProbe` in `WorldCanvas`; `dispose={null}` shared resources
  never fire, by design.)
- `__worldCritterTimersAtUnmount` — pending critter timers after unmount;
  must be `0`.
- `gl.info.memory` on the _new_ renderer is reported alongside, but only
  real dispose events prove the old scene released resources. JS heap stays
  labeled JS heap; GPU duration remains unmeasured (no valid mechanism).

Coverage: `e2e/memory-soak.spec.ts` (baseline over 5 remount cycles + the
dispose-event/critter-timer assertions).
