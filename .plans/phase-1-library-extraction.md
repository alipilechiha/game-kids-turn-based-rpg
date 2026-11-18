# Phase 1 Implementation Plan

## Objective and scope

Deliver a private ESM core package from packages/core/ and migrate the Kids RPG only after a separately installed tarball passes its own consumer gate. Phase 1 is a reusable core-library release, not a completed Three.js RPG engine. Begin a separate 3D game consumer in Phase 2.

In scope: confirmed graph-cache correction, independent package build and boundary, installed tarball checks, game cutover, linked Vite workflow, app import enforcement, release compatibility and rollback.

Remain app-owned: React bindings, quests/dialogue/content, child-safe battle mechanics, camera/render scenes, quality/capabilities, models/assets/audio, accessibility, parental gates, PWA, profiles, migrations/repositories and World Builder v1.

Do not implement a generic renderer, advanced combat, narrative engine, authoring package, new game, or registry publication in Phase 1.

## Repository and source evidence

The initial source review used 0cfcc45a95cde799afae7f801fadd9969dc2301f. Before implementation resumed, main advanced to 577fc2630ab871f3c05b190336f5cef5b9103e8a, including the butterfly/cat GLB and asset-registry work. The task branch is based on that current main. Preserve the asset pipeline and do not include unrelated asset changes in the graph commit.

Candidate package source is the seven pure modules now in src/framework/core: identifiers.ts, world.ts, geometry.ts, graph.ts, pathfinding.ts, runtime.ts and persistence.ts. src/framework/index.ts is the current app entry. examples/hello-world imports the source barrel. Keep it there until the independent tarball gate is green.

Graph defect is confirmed both ways. NEIGHBOURS is keyed only by source.edges even though adjacency construction also depends on source.anchors. A shared A-B edge allows partial A/C and full A/B tables to poison one another based on query order. Fix with an outer WeakMap keyed by anchor-array identity and an inner WeakMap keyed by edge-array identity. Keep edge ordering, neighbor filtering and path semantics.

Preserve Edge.requiresDiscoveryId, MapTransition.discoveryId, WorldMap.cameraZoom and cameraPadding exactly, including optionality. Preserve current runtime including post-disposal behavior. Do not add a subscription guard here.

Persistence stays in the game. Current save schema is 3 and IndexedDB DB_VERSION is 2. Preserve profiles, slot keys, migration, checkpoint, corruption recovery, autosave eligibility, and offline service-worker behavior.

## Package contract

Name waypoint-rpg-core, version 0.1.0, private true, MIT, ESM, sideEffects false, files only dist, Node engine >=22.0.0, package root export only, no runtime or peer dependencies, TypeScript 6.0.3 as development dependency. Include README and license. Do not publish in this plan.

Build using package-local TypeScript NodeNext and ES2022. Set types [], rootDir src, outDir dist, strict, exactOptionalPropertyTypes, noUncheckedIndexedAccess, verbatimModuleSyntax, noEmitOnError, declaration, sourceMap and inlineSources. Use explicit .js specifiers. A compiler probe showed rewriteRelativeImportExtensions emitted .ts specifiers in declarations while explicit .js output correctly in both JS and declarations. Keep tests and app sources out of the package.

Exact public values: createGameRuntime, insideBounds, anchorForLandmark, anchorForNpc, distanceBetween, getAnchor, getAnchorOrNull, neighboursOf, findPath, nearestWalkableAnchor, pathToPoints.

Exact world/graph types: AnchorId, AreaId, DiscoveryId, LandmarkId, MapId, NpcId, TransitionId, Anchor, Bounds, Edge, MapTransition, NpcPlacement, WorldArea, WorldMap, GraphSource, PathPoint.

Exact runtime/persistence types: GameRuntime, GameRuntimeAdapter, GameRuntimeConfig, ReducerContext, RuntimeListener, LoadResult, PersistenceAdapter, PersistenceFailure, SaveScope, StorageFallback.

No deep exports. Keep game local capabilities, quality, camera math, perfProbe and battle. The game facade can continue exporting local APIs beside the core root exports.

## Target structure

    package.json and package-lock.json      root app and workspace
    src/framework/index.ts                  app-local facade
    src/framework/core/capabilities.ts      app-local
    src/framework/core/quality.ts            app-local
    src/framework/core/perfProbe.ts          lazy app-local entry
    src/framework/three/                    app-local camera math
    src/framework/modules/battle/            app-local optional combat
    packages/core/package.json
    packages/core/tsconfig.build.json
    packages/core/README.md
    packages/core/LICENSE
    packages/core/src/index.ts
    packages/core/src/{identifiers,world,geometry,graph,pathfinding,runtime,persistence}.ts
    packages/core/test/*.mjs
    packages/core/dist/                     generated and ignored
    fixtures/framework-consumer/            locked Vite/TypeScript tools and fixture
    scripts/verify-framework-package.ts     pack and isolated install

Keep package output outside root app dist and outside the service-worker precache.

## Six-PR dependency sequence

### PR 1 — Fix graph cache isolation

Scope only src/framework/core/graph.ts and focused graph.test.ts. Test shared A-B edge identity with different anchor arrays. First warm partial A/C by querying C, then assert complete A/B reaches B→A. Use a fresh edge array for the reverse order. Warm complete A/B first, then assert absent B in partial A/C has no neighbors. Add controls for different walkability with shared source tables and a replaced edge array with the same anchors.

Run the two new regression tests against current code and observe expected assertion failures. Then key adjacency cache by the anchor-array/edge-array pair. Run focused tests, existing navigation and Builder suites, and full npm run verify.

Commit only graph.ts and graph.test.ts. Check staged names and *.tsbuildinfo. Do not include roadmap files or original user GLB/registry changes. Do not push.

Acceptance: regressions fail before and pass after the change, related suites pass, npm run verify exits successfully, and commit contains only the two graph paths. Do not begin PR 2 until all acceptance checks pass.

### PR 2 — Build package and enforce its own boundary

After PR 1 passes, add one workspace package under packages/core using a temporary snapshot of the seven candidate modules. Keep app imports unchanged. Add a parity check between snapshot and source after normalizing line endings and .js import suffixes. Remove the snapshot and parity check during PR 4. Reconcile intervening source changes in both copies.

In PR 2 introduce package-side import and dependency enforcement. Parse production package source and allow sibling relative .js imports/exports only when they resolve inside package source. Reject parent/absolute import, dynamic import, require/import assignment, external reference, runtime/optional/bundled/peer dependencies. Compile with types [] without application, browser, Node or renderer types. Test negative import and manifest fixtures and an out-of-tree build.

Add package manifest, explicit index, README, MIT license, local tsc build, and Node built-in contract tests over emitted output. Add framework:build, framework:test and framework:pack.

Build orchestration: root verify explicitly runs framework:build once after format and lint. It then calls package tests, typecheck, tests, build and example build with npm --ignore-scripts run <stage>. Confirm npm 10 suppresses preparation hooks for those already prepared stages. Add no app package prebuild hooks yet because the app still imports source. Direct package test/pack commands build using their own preparation or wrapper.

Acceptance: package copy compiles outside repo, package tests pass, exact exports/file/dependency inventory passes, negative boundaries fail as intended, full npm run verify passes, and app source imports are unchanged.

### PR 3 — Pass installed tarball consumer

After PR 2 passes, add a small fixture and locked TypeScript/Vite tool dependencies. Build and pack one tarball per smoke run. Verify archive inventory and root exports. Copy fixture files to an OS temporary directory outside repo, clear NODE_PATH/NODE_OPTIONS and workspace discovery, install the tarball from disk, and assert its resolved file is inside the temporary project's node_modules.

Test fixed-clock runtime, dispatch/subscription/pause/resume/dispose, world metadata types, graph lookup and multi-edge path, scoped slots, empty/corrupt loads and app-owned restore command. Reject package deep imports in Node and TypeScript. Verify a native thrown lookup maps to graph.ts with --enable-source-maps. Build fixture with Vite.

Separate acceptance claims:

- Offline package installation: install local tarball in an empty project with empty cache and npm install --offline --ignore-scripts --no-audit --no-fund. It has zero runtime dependencies.
- Development tools: install fixture Vite/TypeScript from its own lock using npm ci. Test npm ci --offline with a populated cache separately. A cold tool install may require network/cache fill.
- Runtime: execute emitted native ESM on Node 22.0.0 without browser globals, transpiler, Vite or repository lookup.
- Types: NodeNext and Bundler checks use locked tools.
- Browser bundle: Vite production build proves bundling only.
- Browser execution: use Playwright Chromium. Existing app CI covers two mobile viewport profiles. Other browsers and physical hardware require explicit tests.

Add one focused framework-package job to existing e2e.yml, with Node 22.22.2 build tools and a Node 22.0.0 runtime check. Upload tarball separately. Reuse app and Pages workflows. Do not replicate full app CI.

Hard gate: record passing tarball and isolated consumer results before PR 4 adds package dependency to game or hello-world. Fix failures with both app consumers still using source.

### PR 4 — Migrate app and existing demo

After the external gate is green, add root workspace dependency waypoint-rpg-core: file:packages/core. Verify lock resolution. Update src/framework/index.ts to re-export documented package API and retain app exports. Update battle shared identifier type import and hello-world imports. Remove seven source implementations in the same cutover. Keep app shims and direct lazy perfProbe import.

Every normal app command works from clean checkout without dist. Add framework build preparation to dev, build, typecheck, test, watch, coverage, content validation, release content validation, and example build/dev. The app build calls content validator through npm --ignore-scripts so its package prehook does not compile again. Root verify compiles once and invokes all prepared stages via npm --ignore-scripts.

Acceptance: npm ci and npm run verify pass; verify shows exactly one framework build; game and hello-world resolve package root; focused navigation, worldbuilder and PWA Playwright specs pass; saved game fixtures, authored world and precache remain intact. A baseline comparison exposed a pre-existing World Builder test-driver ambiguity between the cave and challenge entrances; the test now approaches through the authored west-path and park waypoints. No gameplay code changed for that test correction.

### PR 5 — Linked Vite development and app-side boundaries

After cutover commands pass, add framework:watch using tsc --watch and noEmitOnError. Add dev:linked. Wait for first successful package emit before Vite starts. One compiler writes package dist during this workflow. Add a focused linked-development check to the existing Playwright CI job (one shard only) so Linux and local Windows exercise the same script.

Test Vite defaults before adding optimizeDeps.exclude, preserveSymlinks, or resolver/watcher overrides. On Linux and native Windows, edit a package diagnostic string and confirm emitted bytes and actual browser update/reload. Test cold/warm cache, compile error preserving prior output, and recovery after a second valid edit. Use module ID, served bytes, watcher trace and browser response to diagnose. Add config overrides only if the default loop fails with evidence and retain a regression check.

Keep PR 2 library boundary. Add stronger app-side lint that routes game imports through facade, battle uses only public root, and no relative/deep package source imports exist. Align root engines/setup docs to Node 22.22.2 toolchain. Update docs/framework-api.md and getting-started. Keep P3 extraction doc historical.

Acceptance: edit/reload/error/recovery loop works on both platforms or the smallest evidence-driven override passes; deliberate bad imports fail; app and package checks stay green.

### PR 6 — Release and rollback compatibility

After PR 5, extend scripts/check-deploy.ts to verify actual dist and generated worker precache. Reject tarballs, declarations and fixture/package/example outputs from app deployment. Preserve app shell, JS, GLB/audio offline assets, profiling chunk exclusion, hidden maps and current budgets.

Test standard Vite source-map processing before proposing a custom loader. Add loader only after a reproduced failure and regression test.

Use disposable same-origin browser profile: seed stable save on old build, install candidate via worker, resume offline, save newer candidate state, serve old build again, and verify it reads new save. Test legacy slot, v1/v2/v3, separate profiles, corrupt payload retention, unavailable storage and no celebration replay. Keep schema 3, DB version 2, save keys, migration order and save scheduling.

Acceptance: npm run verify, package job, existing Playwright shards, deploy checks and same-origin upgrade/rollback pass. Record physical Android and SwiftShader separately. Roll back to last green app artifact through existing worker update path while retaining IndexedDB for diagnosis.

## Verification matrix

| Claim                 | Evidence                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------ |
| Isolated build        | Package copy builds outside root without aliases, DOM/Node types, app code or undeclared dependencies. |
| Offline archive       | Empty-cache tarball install is successful using local artifact.                                        |
| Dev-tool installation | Locked npm ci passes. Warm-cache offline command is separate.                                          |
| Runtime support       | Node 22.0.0 runs native ESM consumer with no browser/transpiler/repo dependency.                       |
| Toolchain             | Node 22.22.2+ within Node 22 and npm 10 build/type/test gates pass.                                    |
| Type resolution       | NodeNext and Bundler declarations resolve from the tarball.                                            |
| Bundler               | Isolated Vite production build succeeds.                                                               |
| Browser               | Chromium run proves only the tested viewport/browser behavior.                                         |
| App regression        | npm run verify, existing E2E, content/asset and deploy checks, offline PWA/save tests pass.            |
| Hardware              | Manual low-end Android evidence. SwiftShader does not count.                                           |

Phase 1 completion requires independent tarball success before cutover, compiled package entry adoption by game and hello-world, demonstrated linked development, exact API/dependency checks, unchanged game saves/offline behavior, and passing existing application gates. Renderer, narrative, advanced combat, editor, registry publication and independent 3D gameplay remain later work.

Execution follows the six-PR dependency order. PRs 1–5 pass local verification.
PR 1 was committed separately from the approved formatting prerequisite; PR 2
and PR 3 passed their package and installed-consumer gates; PR 4 preserved app
contracts; PR 5 passed the linked-development check on Windows and added that
check to one shard of the existing Linux Playwright job. PR 6 passes local
`npm run verify`, the installed tarball consumer, PWA offline/save specs, and
the same-origin baseline → candidate → offline save → baseline rollback test.
The test confirms schema 3, IndexedDB v2, preserved newer progress and no
celebration replay. Linux CI execution remains pending. PR 1 and PR 2 were
pushed after the user's explicit follow-up request. Keep later work in scoped
local commits and do not push, publish, or deploy without a later request.
