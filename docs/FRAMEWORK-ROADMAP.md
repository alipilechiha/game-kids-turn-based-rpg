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
in the existing Linux Playwright job. Release and rollback compatibility remain
the final Phase 1 gate. PR 1 and PR 2 were pushed on explicit request; later
work remains local until separately requested.

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

| Phase                         | Deliverable                                                                                                                                                                           | Prerequisite and exit evidence                                                                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Reusable core              | Build, test, version, pack and document the independent package. Migrate the app only after installed-tarball gate.                                                                   | All criteria in .plans/phase-1-library-extraction.md pass.                                                                                                            |
| 2. World/renderer             | Start a separate 3D game consumer. Use it with the Kids RPG to define scenes, maps, camera modes, environment data, triggers, dynamic world projection, loading and lifecycle.        | Prove two scenes, transition, cancellation, demand-rendered idle, context loss and cleanup before publishing renderer contracts.                                      |
| 3. Narrative/quests           | Add typed conditions/effects, branching dialogue, quest outcomes, cancellation, world state and save/resume. Add relationships/reputation when used.                                  | Second game saves and replays a branching consequence. Validate broken references and unsupported operations. Never execute arbitrary uploaded JavaScript.            |
| 4. Gameplay modules           | Add optional progression, inventory, equipment, abilities, status effects, tactical combat and enemy behavior from consumer needs. Keep real-time action combat independent.          | Module tests pass and a narrative build without combat remains independent.                                                                                           |
| 5. Animation/cinematics       | Add a rig-preserving load path, per-instance skeleton/mixer, clips, blending, timelines, camera/dialogue staging, synchronized audio, effects and resource ownership.                 | 3D consumer proves cancellation, cleanup, reduced motion and idle behavior. Preserve the Kids RPG static GLB flow.                                                    |
| 6. Developer tools            | Add portable world, dialogue, quest, NPC, asset and timeline authoring after two consumers use relevant contracts.                                                                    | Both games can round-trip, validate and preview their own content. Keep Builder v1 compatible through transition.                                                     |
| 7. Shahnameh proof of concept | Build خون سیاوش — فصل نخست: برگ خون with two environments, NPCs, branching dialogue, one meaningful moral choice, one battle, conditional world change, two outcomes and save/resume. | Begin after the second 3D consumer validates rendering, narrative persistence and selected combat. Record packages used and omitted. Full editor tooling is optional. |

Blood of Siyavash exercises narrative and tactical play. Iron and Serpents can validate real-time combat. The Burned Feather can validate transformations and cinematic animation. Story and theme remain game-owned.

## Compatibility, policy and risks

Phase 1 preserves child UX, nonviolent rules, content validation, parental gates, accessibility, touch targets, Persian/RTL, existing saves, offline/PWA, assets, GLB/cubic fallbacks, quality tiers, cleanup and WebGL handling. These app rules do not become framework defaults.

Distinguish these compatibility claims:

- Core runtime: Node >=22.0.0, tested by executing emitted native ESM on Node 22.0.0.
- Root project and build tools: `engines` requires Node >=22.22.2 <23 and npm >=10 <11. CI pins Node 22.22.2 for the workspace, application build and development tools.
- Offline artifact install: install the zero-runtime-dependency local tarball with an empty cache, separately from dev tool installs.
- Development tools: install locked Vite/TypeScript normally, then test offline with a populated cache.
- TypeScript: verify both NodeNext and Bundler resolutions using the locked tools.
- Browser bundling: build an installed consumer with Vite. A successful build does not prove every browser.
- Browser execution: the linked-development check and package consumer use Chromium; application Playwright checks cover Chromium at mobile viewports. Other browsers and physical hardware need separate runs.
- Hardware: historical SwiftShader measurements are not evidence of physical Android behavior.

Risks include undeclared dependencies, declaration ESM mismatch, workspace hoisting masking imports, stale Vite linked output, deployment/precache leakage, save compatibility drift, public API instability, and CI growth. Use package-side import checks, isolated tarball installation, source watch tests, actual archive/precache inspection, existing application CI, and same-origin rollback.

The codebase can become a reusable RPG library without an engine rewrite. Phase 1 proves a core library; future 3D engine capability requires validation in Phase 2.
