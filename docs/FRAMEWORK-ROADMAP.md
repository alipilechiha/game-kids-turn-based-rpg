# Reusable RPG Core Framework Roadmap

## Executive summary

Extract one dependency-free TypeScript ESM package through npm workspaces, while keeping the Kids RPG and its renderer at the repository root. Phase 1 delivers a reusable core library, not a completed Three.js RPG engine. The game adopts the package only after an independently installed archive passes a consumer gate. Begin validating a separate 3D game consumer in Phase 2.

Retain React, Three.js, React Three Fiber, Drei, Vite, and the existing app architecture. Preserve child-facing semantics, Persian/RTL, saves, offline/PWA, content and asset rules, and the current renderer.

## Current architecture assessment

The initial review used 0cfcc45a95cde799afae7f801fadd9969dc2301f. Implementation is based on 577fc2630ab871f3c05b190336f5cef5b9103e8a, which includes the GLB/asset-registry work. Before extraction, `examples/hello-world` was a DOM-only consumer of the source barrel. PR 3 passed the independent installed-tarball gate; PR 4 now points both the game and hello-world at the package root. Keep `docs/framework-extraction.md` as historical evidence for the original in-repository boundary.

| Candidate        | Verified capability                                                                                                                                                                                                                              | Phase 1 ownership and gap                                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime          | `packages/core/src/runtime.ts` provides an injected reducer and clock, subscriptions, pause/resume and disposal                                                                                                                                  | Preserve existing behavior mechanically. Add no new store or persistence scheduling.                                                                                |
| World/navigation | Identifiers, bounds, graph lookup, A* and structural DTOs are independent of React and Three.js                                                                                                                                                  | The seven pure modules now live in `packages/core/`; the confirmed graph adjacency-cache isolation defect is fixed and regression-tested.                           |
| Persistence      | `packages/core/src/persistence.ts` defines generic scoped load/save results                                                                                                                                                                      | Package only the contract. Profile selection, migration, boot, repositories, autosave and IndexedDB stay in the game.                                               |
| Renderer         | WorldCanvas selects Hub, CaveWorld and ChallengeWorld directly. CameraRig and modelProvider use Kids RPG camera, avatar, visual variants, quality and fallback policy                                                                            | Keep current renderer and scenes in the game. Validate renderer contracts with a separate 3D game consumer in Phase 2.                                              |
| Battle/narrative | The Kids RPG's battle, quests, dialogue and validation remain application-specific. The optional `packages/narrative/` package now provides generic typed dialogue, conditions, effects, quests and state transitions for independent consumers. | Keep the Kids RPG's authored rules and saves unchanged. Do not make narrative a dependency of the core package; consumers opt in to the separate narrative package. |
| World Builder    | Versioned JSON documents are checked and compiled to a preview WorldSource using game-owned NPC data                                                                                                                                             | Keep Builder v1, editor and preview integration in the game. Extract portable authoring later.                                                                      |
| Assets           | Licensed GLBs, static conversion, provenance, quality gating, cubic fallback and cleanup are implemented for the app                                                                                                                             | Keep manifest, artistic policy and offline release decisions with each game. A rig-preserving path belongs to the later renderer phase.                             |

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

`examples/scene-demo/` was introduced in Phase 2 as an independent Three.js
consumer of `waypoint-rpg-core`. Phase 3 added the optional narrative package
and the original story described below. Its scene registry, loader, host
lifecycle, camera setup, R3F components, authored story, save coordinator, and
runtime-fact projection are example-owned. It imports only the public roots of
the core and narrative packages and contains no Kids RPG source imports. This
validates two package consumers in one 3D application; it does not add a
renderer API or claim a completed Three.js RPG engine.

The example registers courtyard and workshop scenes with navigable transition
anchors. Its host keeps the current scene mounted while a destination loads,
preserves the current scene on load failure, cancels and disposes superseded
loads, and disposes active resources at teardown. A single demand-rendered
canvas remains mounted across map transitions. The scenes demonstrate
perspective and orthographic cameras and project a runtime lantern fact
into the workshop. Browser smoke coverage also checks settled idle frames,
subscriptions, scene disposal, and recovery after simulated WebGL context loss.

`npm run example:scene-build` builds the core and narrative packages first,
then builds this example with the default Vite resolver and no `optimizeDeps`
or resolver overrides.
`npm run verify` builds the core once before the repository checks and invokes
the example build with npm lifecycle hooks disabled to avoid recompiling it.
`npm run framework:scene-consumer` performs the package-side boundary/build
checks, copies the example outside the repository, installs its locked
development tools, installs both built package tarballs from disk in offline
mode, then runs typecheck, unit tests, the Vite build, and Chromium browser
smoke. The existing e2e workflow contains a focused step for this consumer
rather than a duplicate application CI workflow.

Phase 2 compatibility evidence is intentionally split:

- Package installation: the local core and narrative tarballs install offline
  after the consumer's development tools have been installed. Both packages
  have zero runtime dependencies; the core's empty-cache native Node install
  remains covered by the Phase 1 package gate.
- Development tools: the scene consumer installs exact locked React,
  React Three Fiber, Three.js, Vite, TypeScript, Vitest, and Playwright versions
  with `npm ci`. This is a separate network/cache operation from package
  archive installation.
- Node runtime: the core and narrative manifests declare Node >=22.0.0. Phase 3
  package and consumer checks ran locally on Node 22.23.5; the existing
  core-only CI minimum-runtime job uses Node 22.0.0, and the combined consumer
  CI job uses Node 22.22.2. The narrative package's 22.0.0 minimum is declared
  but was not separately exercised in this phase. The root project, example
  build, and development tools require Node >=22.22.2 <23 and npm >=10 <11;
  CI pins Node 22.22.2 for root/build tooling. Build-time requirements are not
  implied by the package runtime floor.
- Browser: the scene lifecycle smoke uses Chromium with WebGL, including the
  tested SwiftShader path in headless CI. This is evidence for the tested
  Chromium environment only; other browsers and physical hardware require
  separate validation.

The next renderer decision follows the independent consumer evidence. Keep
scene registration, map transitions, camera policy, resource loading, R3F
components, and game-specific world projection private to the example until a
second real game consumer establishes which contracts should be reusable.

### Current verification and open design decisions

Local Phase 2 verification passed on Node 22.23.5/npm 10.9.9: `npm run verify`
passed all 15 core tests and 474 application tests, then built the app,
hello-world, and scene consumer. The earlier core-only scene-consumer gate
passed its offline tarball installation, 9 unit tests, Vite build, and
Chromium WebGL lifecycle smoke. Phase 3 adds a combined core+narrative tarball
gate and a Persian branching story; its current final verification is recorded
in the Phase 3 section below. The demo is a validation consumer, not evidence
from a second shipped game or other browser/device.

Keep these decisions open until another real consumer needs the same
capabilities: whether scene registration/loading should become a package API;
whether camera contracts should be shared; and which renderer/resource
ownership boundary is common enough to extract. Do not extract narrative,
combat, authored content, or asset policy from this demo alone.

## Phase 3 implementation status — narrative and quests

Phase 3 delivers the optional `waypoint-rpg-narrative` ESM package and extends
only the independent scene-demo. The package exports validated and deeply
copied/immutable narrative definitions, deterministic condition evaluation,
atomic typed effects, quest lifecycle queries, dialogue views, save-state
decoding, and revision/playthrough-checked transitions from one package root.
It has no runtime dependencies and imports no React, Three.js, browser, storage,
core, or application modules. Its consumer boundary is verified from an
independently installed tarball with NodeNext and Bundler declaration checks
and rejected deep imports.

The demo's original Persian story, برگ خون — The Blood Leaf, demonstrates two
branches, quest outcomes, distinct endings, a condition-checked workshop
interaction, and a persistent lantern consequence. The application owns its
versioned save envelope, bootstrap/hydration, localStorage adapter, scene and
playthrough eligibility, save/reset recovery, and modal presentation. `SceneHost`
remains example-owned and can restore a validated map entry anchor. The Kids
RPG does not import the narrative package and its dialogue, quest, save, offline
and safety contracts remain unchanged.

This phase does not complete a general-purpose Three.js RPG engine. Scene
loading, rendering, camera policy, movement, combat, UI and authored narrative
remain game-owned. The current evidence is one independent 3D validation app,
not another shipped game or broad browser/device coverage. See
`docs/framework-api.md` and `examples/scene-demo/README.md` for the implemented
API and consumer boundaries; the detailed acceptance record is in
`.plans/phase-3-narrative-quest-engine.md`.

Local verification on 2026-11-21 used Node 22.23.5/npm 10.9.9. `npm run
verify` exited successfully: 15 core tests, 25 narrative tests, and 493 Kids
RPG tests across 47 files passed, followed by the app, hello-world, and
scene-demo production builds. The core tarball, narrative tarball, combined
scene-demo tarballs, and linked Vite source-update/error-recovery checks all
passed. Chromium story/accessibility and scene-lifecycle smoke passed. Existing
lint/content/asset placeholder and large-chunk warnings remain; no errors were
reported. The baseline `main` E2E (all four shards and framework consumer) and
Pages workflows were green when checked. This unpushed feature branch has not
run its own GitHub Actions workflow; other browsers and physical devices remain
unverified.

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

    independent 3D story consumer ─── installed core + optional narrative tarballs

    future 3D game ─── selected core and optional renderer/gameplay modules

### Roadmap and gates

| Phase                               | Status      | Deliverable                                                                                                                                                                                        | Prerequisite and exit evidence                                                                                                                                                                                                     | Evidence                                                               |
| ----------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1. Reusable core                    | Complete    | Independent, dependency-free core ESM package, adopted by the Kids RPG after tarball verification.                                                                                                 | Extraction, API compatibility, offline installation, and rollback criteria recorded in the Phase 1 plan pass.                                                                                                                      | [PR #110](https://github.com/hmmftg/game-kids-turn-based-rpg/pull/110) |
| 2. 3D scene consumer                | Complete    | Example-owned Three.js/R3F scene host, registration, transitions, cameras, loading, runtime projection, and lifecycle validation. No renderer package was extracted.                               | Independent core tarball consumer, two scenes, cancellation/failure, settled demand rendering, context recovery, and disposal checks pass.                                                                                         | [PR #111](https://github.com/hmmftg/game-kids-turn-based-rpg/pull/111) |
| 3. Narrative and quests             | Complete    | Optional pure narrative package and Persian branching-story proof in the independent scene consumer.                                                                                               | Deterministic runtime, independent tarball, distinct outcomes, persisted world consequence, reset/recovery, and Kids RPG compatibility criteria pass.                                                                              | [PR #113](https://github.com/hmmftg/game-kids-turn-based-rpg/pull/113) |
| 4. Gameplay modules                 | In progress | Optional gameplay package with definitions, progression, inventory, equipment, abilities, statuses, tactical combat, enemy decisions, rewards, and state codec. Merged implementation is retained. | Close the recorded exit-evidence gaps: standalone gameplay tarball/runtime gate, combined scene consumer proof, real combat-to-narrative transaction rollback, and gameplay save/resume. Do not repeat the merged implementation.  | [PR #116](https://github.com/hmmftg/game-kids-turn-based-rpg/pull/116) |
| 5. Model, animation, and cinematics | Next        | Offline local model intake, rig-preserving Three.js adapter, independent animated instances, and optional cancellable presentation timelines.                                                      | Static and rigged licensed GLBs import reproducibly; independent instances, animation state projection, timeline controls, scene cancellation/disposal, reduced motion, reload, and WebGL recovery pass in the reference consumer. | [Phase 5 plan](../.plans/phase-5-model-animation-cinematics.md)        |
| 6. Asset and game creation tools    | Planned     | Offline import CLI, shared licensed asset catalog, preview/inspection, and a versioned small-game template.                                                                                        | Narrative and structurally different tactical consumers build independently from the template and round-trip owned content without copying private runtime code.                                                                   | [Product release roadmap](PRODUCT-RELEASE-ROADMAP.md)                  |
| 7. Five playable games              | Planned     | Five independently buildable, single-map games with complete interaction loops, separate saves, audience/accessibility review, and source-rendered previews.                                       | Each game meets its specification and exercises a justified subset of reusable packages; tactical and real-time combat claims pass their own gates.                                                                                | [Product release roadmap](PRODUCT-RELEASE-ROADMAP.md)                  |
| 8. Individual releases              | Planned     | Per-game build, deployment, preview, version, and release gates plus a portfolio index.                                                                                                            | Complete playthrough, persistence/restart, approved rights, performance/lifecycle/accessibility checks, rendered screenshots, deployment smoke, and release notes pass per game.                                                   | [Product release roadmap](PRODUCT-RELEASE-ROADMAP.md)                  |
| 9. Player evaluation                | Planned     | Voluntary, privacy-conscious feedback and a documented Continue, Revise, or Stop decision for each release.                                                                                        | Review actual player feedback after a defined release trial; add no telemetry without audience, consent, and policy review.                                                                                                        | [Product release roadmap](PRODUCT-RELEASE-ROADMAP.md)                  |

This table is the source of truth for the generated README roadmap. Change a phase's status only when its exit criteria are met; after editing, run `npm run roadmap:sync`. Merging alone does not complete a phase.

The five-game portfolio, asset catalog, capability matrix, execution dependencies, and release/evaluation rules live in `docs/PRODUCT-RELEASE-ROADMAP.md`. The current two-scene Garden sample and the Phase 4 scene-demo remain reference consumers, not portfolio releases. Proposed game names and stories remain proposals until approved.

### Baseline evidence at Phase 5 planning

Phase 4 merge `693aae689065d108e84b85a16c5651d625c29ab2` has successful Pages and roadmap-synchronization workflows. Its framework consumer and E2E shard 4 passed when inspected. E2E shards 1–3 were still running, so full post-merge E2E was not yet confirmed. The [Reference game screenshots workflow](https://github.com/hmmftg/game-kids-turn-based-rpg/actions/runs/45018058155) failed at step 5, **Check repository formatting**. Chromium installation, production build, screenshot capture, and gallery update were skipped. Track and diagnose this baseline independently before attributing a formatting failure to later documentation changes.

## Compatibility, policy and risks

Phase 1 preserves child UX, nonviolent rules, content validation, parental gates, accessibility, touch targets, Persian/RTL, existing saves, offline/PWA, assets, GLB/cubic fallbacks, quality tiers, cleanup and WebGL handling. These app rules do not become framework defaults.

Distinguish these compatibility claims:

- Core runtime: Node >=22.0.0, tested by executing emitted native ESM on Node 22.0.0.
- Narrative runtime: package manifest declares Node >=22.0.0 and the pure
  browser-neutral TypeScript ESM runtime uses no Node-specific APIs. Phase 3
  local package checks ran on Node 22.23.5; the declared 22.0.0 narrative
  minimum was not separately exercised. Phase 4 P4.0f adds a CI gate that
  prepares both installed archives under Node 22.22.2, then probes their native
  ESM runtime under Node 22.0.0 without invoking npm or build tools; that new
  branch configuration still requires its GitHub Actions run for execution
  evidence. Root and demo build tooling still require the root engine versions
  below.
- Root project and build tools: `engines` requires Node >=22.22.2 <23 and npm >=10 <11. CI pins Node 22.22.2 for the workspace, application build and development tools.
- Offline package installation: install the zero-runtime-dependency local tarball from disk with npm offline, separately from development-tool installation. Phase 1 additionally tests native Node installation with an empty npm cache.
- Development-tool installation: install the consumer's locked Vite/TypeScript/React/Three.js/Playwright toolchain with `npm ci`; network/cache availability for tools is distinct from offline package installation.
- TypeScript: verify both NodeNext and Bundler resolutions using the locked tools.
- Browser bundling: build an installed consumer with Vite. A successful build does not prove every browser.
- Browser execution: the linked-development check, independent package
  consumers, narrative story smoke, and application Playwright checks use
  Chromium. The demo exercises the R3F/WebGL lifecycle and DOM/RTL narrative
  controls in Chromium; this does not establish other-browser or physical-device
  compatibility.
- Hardware: historical SwiftShader measurements are not evidence of physical Android behavior.

Risks include undeclared dependencies, declaration ESM mismatch, workspace hoisting masking imports, stale Vite linked output, deployment/precache leakage, save compatibility drift, public API instability, and CI growth. Use package-side import checks, isolated tarball installation, source watch tests, actual archive/precache inspection, existing application CI, and same-origin rollback.

The codebase can become a reusable RPG library without an engine rewrite. Phase 1 proves a core library; future 3D engine capability requires validation in Phase 2.
