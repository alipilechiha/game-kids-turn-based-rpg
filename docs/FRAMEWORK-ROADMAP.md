# Reusable RPG Core Framework Roadmap

## Executive summary

Extract one dependency-free TypeScript ESM package through npm workspaces, while keeping the Kids RPG and its renderer at the repository root. Phase 1 delivers a reusable core library, not a completed Three.js RPG engine. The game adopts the package only after an independently installed archive passes a consumer gate. Begin validating a separate 3D game consumer in Phase 2.

Retain React, Three.js, React Three Fiber, Drei, Vite, and the existing app architecture. Preserve child-facing semantics, Persian/RTL, saves, offline/PWA, content and asset rules, and the current renderer.

## Current architecture assessment

The initial review used 0cfcc45a95cde799afae7f801fadd9969dc2301f. Implementation is based on 577fc2630ab871f3c05b190336f5cef5b9103e8a, which includes the GLB/asset-registry work. Before extraction, `examples/hello-world` was a DOM-only consumer of the source barrel. PR 3 passed the independent installed-tarball gate; PR 4 now points both the game and hello-world at the package root. Keep `docs/framework-extraction.md` as historical evidence for the original in-repository boundary.

| Candidate        | Verified capability                                                                                                                                                   | Phase 1 ownership and gap                                                                                                                 |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime          | `packages/core/src/runtime.ts` provides an injected reducer and clock, subscriptions, pause/resume and disposal                                                       | Preserve existing behavior mechanically. Add no new store or persistence scheduling.                                                      |
| World/navigation | Identifiers, bounds, graph lookup, A* and structural DTOs are independent of React and Three.js                                                                       | The seven pure modules now live in `packages/core/`; the confirmed graph adjacency-cache isolation defect is fixed and regression-tested. |
| Persistence      | `packages/core/src/persistence.ts` defines generic scoped load/save results                                                                                           | Package only the contract. Profile selection, migration, boot, repositories, autosave and IndexedDB stay in the game.                     |
| Renderer         | WorldCanvas selects Hub, CaveWorld and ChallengeWorld directly. CameraRig and modelProvider use Kids RPG camera, avatar, visual variants, quality and fallback policy | Keep current renderer and scenes in the game. Validate renderer contracts with a separate 3D game consumer in Phase 2.                    |
| Battle/narrative | Battle is pure code but defines current fixed hearts, intent, actions and abilities. Quests, dialogue and validation belong to the app                                | Keep existing child-friendly mechanics and authored rules in the game. Generalize only from another consumer.                             |
| World Builder    | Versioned JSON documents are checked and compiled to a preview WorldSource using game-owned NPC data                                                                  | Keep Builder v1, editor and preview integration in the game. Extract portable authoring later.                                            |
| Assets           | Licensed GLBs, static conversion, provenance, quality gating, cubic fallback and cleanup are implemented for the app                                                  | Keep manifest, artistic policy and offline release decisions with each game. A rig-preserving path belongs to the later renderer phase.   |

Source evidence includes src/framework/index.ts, docs/framework-api.md, docs/performance-final-report.md, src/world/WorldCanvas.tsx, src/worldbuilder/runtimeAdapter.ts and docs/MODELS.md.

## Phase 1 implementation status

The core workspace package, independent tarball consumer gate, Kids RPG cutover,
application import boundary, and linked Vite development workflow are in place.
The linked workflow passed cold/warm start, browser reload, failed-compile
output preservation, and recovery checks on Windows; the same focused check is
in the existing Linux Playwright job. PR 6 now checks the built deployment tree,
service-worker precache, hidden source maps, and a same-origin old/candidate/old
save round trip. The Windows release/rollback check passed with a real baseline
build, offline candidate resume, schema 3/IndexedDB v2 save, rollback to the
baseline build, and no celebration replay. PR #110 merged the six extraction
steps into main. The post-merge package-consumer and Pages checks passed; all
four Playwright shards passed after shard 2 was rerun. Commit 20be589 added a
follow-up deployment-artifact guard. Phase 1 is complete; Phase 2 validates a
second 3D consumer without extracting a renderer yet.

## Phase 2 consumer validation

`examples/scene-demo/` is an independent Three.js game consumer. Its scene
registry, loader, host lifecycle, camera setup, R3F components, and runtime-fact
projection are example-owned. It imports the `waypoint-rpg-core` public root
only and contains no Kids RPG source imports. It proves the core package can
support a 3D consumer; it does not add a renderer API or claim a completed RPG
engine.

The example registers courtyard and workshop scenes with navigable transition
anchors. Its host keeps the current scene mounted while a destination loads,
preserves the current scene on load failure, cancels and disposes superseded
loads, and disposes active resources at teardown. A single demand-rendered
canvas remains mounted across map transitions. The scenes demonstrate
perspective and orthographic cameras and project a runtime lantern fact
into the workshop. Browser smoke coverage also checks settled idle frames,
subscriptions, scene disposal, and recovery after simulated WebGL context loss.

`npm run example:scene-build` builds the core first, then builds this example
with the default Vite resolver and no `optimizeDeps` or resolver overrides.
`npm run verify` builds the core once before the repository checks and invokes
the example build with npm lifecycle hooks disabled to avoid recompiling it.
`npm run framework:scene-consumer` performs the package-side boundary/build
checks, copies the example outside the repository, installs its locked
development tools, installs the built core tarball from disk in offline mode,
then runs typecheck, unit tests, the Vite build, and Chromium browser smoke. The
existing e2e workflow contains a focused step for this consumer rather than a
duplicate application CI workflow.

Phase 2 compatibility evidence is intentionally split:

- Package installation: the local core tarball installs offline after the
  consumer's development tools have been installed. The core's zero-runtime-
  dependency contract and empty-cache native Node install remain covered by
  the Phase 1 package gate.
- Development tools: the scene consumer installs exact locked React,
  React Three Fiber, Three.js, Vite, TypeScript, Vitest, and Playwright versions
  with `npm ci`. This is a separate network/cache operation from package
  archive installation.
- Node runtime: emitted core ESM is tested at Node 22.0.0. The root project,
  example build, and development tools require Node >=22.22.2 <23 and npm >=10
  <11; CI uses Node 22.22.2 for build tools and Node 22.0.0 for the core
  runtime check.
- Browser: the scene lifecycle smoke uses Chromium with WebGL, including the
  tested SwiftShader path in headless CI. This is evidence for the tested
  Chromium environment only; other browsers and physical hardware require
  separate validation.

The next renderer decision follows the independent consumer evidence. Keep
scene registration, map transitions, camera policy, resource loading, R3F
components, and game-specific world projection private to the example until a
second real game consumer establishes which contracts should be reusable.

### Current verification and open design decisions

Local verification passed on Node 22.23.5/npm 10.9.9: `npm run verify` passed
all 15 core tests and 474 application tests, then built the app, hello-world,
and scene consumer. The isolated scene-consumer gate passed its offline tarball
installation, 9 unit tests, Vite build, and Chromium WebGL lifecycle smoke.
The focused CI step is configured in the existing e2e workflow but has not yet
run for this feature branch. The demo is a validation consumer, not evidence
from a second shipped game or other browser/device.

Keep these decisions open until another real consumer needs the same
capabilities: whether scene registration/loading should become a package API;
whether camera contracts should be shared; and which renderer/resource
ownership boundary is common enough to extract. Do not extract narrative,
combat, authored content, or asset policy from this demo alone.

## Selected architecture

Use one workspace package at packages/core/ while keeping the game at the repository root. Name it waypoint-rpg-core. This is a private, unscoped identity and assumes no registry ownership. Package output is ESM, TypeScript declarations and JS source maps with embedded sources. Export only the package root. Runtime and peer dependencies are empty. Public registry publication is deferred.

Use the repository's pinned TypeScript 6 compiler with a package-local NodeNext/ES2022 configuration, strict checking, types set to [], declarations, source maps, and inline sources. Compile only package code. Use explicit .js relative imports. A TypeScript 6.0.3 emission probe found that rewriteRelativeImportExtensions emits .js in JavaScript but leaves .ts in declaration imports. Explicit .js specifiers work in both outputs, without another bundler.

Keep the current DTO fields and optionality for Edge.requiresDiscoveryId, MapTransition.discoveryId, and WorldMap.cameraZoom/cameraPadding. The game interprets these as discovery, transition and camera policy. They introduce no application imports in the core. Preserve GameRuntime's current clock, notification, pause/resume and disposal behavior. Do not add the post-disposal subscription guard during packaging.

Package API:

| Group                     | Exact exports                                                                                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Values                    | createGameRuntime, insideBounds, anchorForLandmark, anchorForNpc, distanceBetween, getAnchor, getAnchorOrNull, neighboursOf, findPath, nearestWalkableAnchor, pathToPoints |
| Identifiers/world/graph   | AnchorId, AreaId, DiscoveryId, LandmarkId, MapId, NpcId, TransitionId, Anchor, Bounds, Edge, MapTransition, NpcPlacement, WorldArea, WorldMap, GraphSource, PathPoint      |
| Runtime/persistence types | GameRuntime, GameRuntimeAdapter, GameRuntimeConfig, ReducerContext, RuntimeListener, LoadResult, PersistenceAdapter, PersistenceFailure, SaveScope, StorageFallback        |

Keep capabilities, quality policy, camera math, perfProbe and the current battle module in game-owned paths for Phase 1. Do not expose internal subpaths or app save types.

### Repository strategy

| Strategy                               | Tradeoff                                                                                                                                                         |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| npm workspaces, game stays at root     | Recommended. Preserves Git history, Pages deployment and app scripts while enabling independent package build and tarball verification.                          |
| Separate repository                    | Revisit after ownership or release cadence separates. Adds cross-repo coordination, release/version flow and offline distribution before there is a second team. |
| Package current src/framework directly | Avoid. The internal barrel combines candidate core with browser probes and app policy, requiring a second package selection.                                     |

The tarball gate proves independence. Workspace links support local iteration after the gate. Do not move the application under games/ in this phase.

Dependency direction:

    Kids RPG
      ├── game-local facade ─── waypoint-rpg-core
      ├── game-local battle module ─── core identifiers
      └── React / React DOM / R3F / Three.js / Drei / PWA

    standalone TypeScript consumer ─── installed core tarball

    future 3D game ─── selected core and optional renderer/gameplay modules

### Roadmap and gates

| Phase                         | Deliverable                                                                                                                                                                                                                   | Prerequisite and exit evidence                                                                                                                                                                                    |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Reusable core              | Build, test, version, pack and document the independent package. Migrate the app only after installed-tarball gate.                                                                                                           | All criteria in .plans/phase-1-library-extraction.md pass.                                                                                                                                                        |
| 2. World/renderer             | Validate scene registration, map transitions, cameras, loading, runtime projection and resource lifecycle in `examples/scene-demo/`, a second 3D consumer that installs the core tarball. Renderer contracts remain deferred. | Pass isolated tarball install, type/unit/build checks and Chromium lifecycle smoke; prove two scenes, same-canvas transitions, load cancellation/failure, settled demand rendering, context recovery and cleanup. |
| 3. Narrative/quests           | Add typed conditions/effects, branching dialogue, quest outcomes, cancellation, world state and save/resume. Add relationships/reputation when used.                                                                          | Second game saves and replays a branching consequence. Validate broken references and unsupported operations. Never execute arbitrary uploaded JavaScript.                                                        |
| 4. Gameplay modules           | Add optional progression, inventory, equipment, abilities, status effects, tactical combat and enemy behavior from consumer needs. Keep real-time action combat independent.                                                  | Module tests pass and a narrative build without combat remains independent.                                                                                                                                       |
| 5. Animation/cinematics       | Add a rig-preserving load path, per-instance skeleton/mixer, clips, blending, timelines, camera/dialogue staging, synchronized audio, effects and resource ownership.                                                         | 3D consumer proves cancellation, cleanup, reduced motion and idle behavior. Preserve the Kids RPG static GLB flow.                                                                                                |
| 6. Developer tools            | Add portable world, dialogue, quest, NPC, asset and timeline authoring after two consumers use relevant contracts.                                                                                                            | Both games can round-trip, validate and preview their own content. Keep Builder v1 compatible through transition.                                                                                                 |
| 7. Shahnameh proof of concept | Build خون سیاوش — فصل نخست: برگ خون with two environments, NPCs, branching dialogue, one meaningful moral choice, one battle, conditional world change, two outcomes and save/resume.                                         | Begin after the second 3D consumer validates rendering, narrative persistence and selected combat. Record packages used and omitted. Full editor tooling is optional.                                             |

Blood of Siyavash exercises narrative and tactical play. Iron and Serpents can validate real-time combat. The Burned Feather can validate transformations and cinematic animation. Story and theme remain game-owned.

## Compatibility, policy and risks

Phase 1 preserves child UX, nonviolent rules, content validation, parental gates, accessibility, touch targets, Persian/RTL, existing saves, offline/PWA, assets, GLB/cubic fallbacks, quality tiers, cleanup and WebGL handling. These app rules do not become framework defaults.

Distinguish these compatibility claims:

- Core runtime: Node >=22.0.0, tested by executing emitted native ESM on Node 22.0.0.
- Root project and build tools: `engines` requires Node >=22.22.2 <23 and npm >=10 <11. CI pins Node 22.22.2 for the workspace, application build and development tools.
- Offline package installation: install the zero-runtime-dependency local tarball from disk with npm offline, separately from development-tool installation. Phase 1 additionally tests native Node installation with an empty npm cache.
- Development-tool installation: install the consumer's locked Vite/TypeScript/React/Three.js/Playwright toolchain with `npm ci`; network/cache availability for tools is distinct from offline package installation.
- TypeScript: verify both NodeNext and Bundler resolutions using the locked tools.
- Browser bundling: build an installed consumer with Vite. A successful build does not prove every browser.
- Browser execution: the linked-development check, independent consumers, and application Playwright checks use Chromium. The Phase 2 consumer exercises WebGL lifecycle in Chromium; this does not establish other-browser or physical-device compatibility.
- Hardware: historical SwiftShader measurements are not evidence of physical Android behavior.

Risks include undeclared dependencies, declaration ESM mismatch, workspace hoisting masking imports, stale Vite linked output, deployment/precache leakage, save compatibility drift, public API instability, and CI growth. Use package-side import checks, isolated tarball installation, source watch tests, actual archive/precache inspection, existing application CI, and same-origin rollback.

The codebase can become a reusable RPG library without an engine rewrite. Phase 1 proves a core library; future 3D engine capability requires validation in Phase 2.
