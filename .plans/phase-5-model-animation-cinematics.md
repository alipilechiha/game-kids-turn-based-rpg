# Phase 5 — Model Loading, Rigged Animation, and Cinematic Presentation

## 1. Objective

Prove that an independent game consumer can import approved local GLB/glTF content, render static and rigged models, animate independent character instances from committed game state, and stage a short optional sequence. The path must work without Meshy, a paid service, the original modeling application at runtime, or changes to the Kids RPG conversion pipeline. Phase 5 delivers a reference implementation and evidence. It does not declare a public renderer package.

## 2. Baseline and current state

Use repository `hmmftg/game-kids-turn-based-rpg`, latest baseline `693aae689065d108e84b85a16c5651d625c29ab2` (PR #116). Verify `origin/main` again when execution starts, inspect current `AGENTS.md`, and create a fresh `codex/phase5-model-animation` worktree. Preserve other worktrees, particularly the two-scene Garden workstream.

Verified structure includes `packages/core`, `packages/narrative`, `packages/gameplay`, `examples/scene-demo`, `scripts/convert-model.ts`, `src/services/assets/registry.ts`, and `docs/MODELS.md`. Core provides runtime/world contracts. Narrative and gameplay are independent optional ESM packages. The example owns its multi-scene host and R3F lifecycle. Its scene host aborts pending loads and disposes late resources. The Kids RPG static asset pipeline converts to vertex colors and may remove animation data through `--unskin` and `--no-anim`; do not change it for this phase.

The screenshot workflow at the baseline SHA failed at step 5 `Check repository formatting`, before browser setup, build, or capture. Pages and roadmap synchronization succeeded. Framework consumer and shard 4 passed, while shards 1–3 were still running when checked. This workflow result predates Phase 5.

### Ownership boundaries

- **Renderer-neutral data:** game-owned, validated asset IDs and hashes; semantic action names mapped to clip IDs; timeline cue data and authored content. Keep Three.js types and mutable runtime instances out of the three existing framework packages.
- **Three.js adapter:** example-private GLTF load, clone and skeleton creation, AnimationMixer ownership, clip action transitions, cue scheduling, and cleanup. Extract only after a second independent consumer demonstrates the same contract.
- **Game-owned:** licenses, manifests, asset choice, map/player state, narrative text, save policy, input, gameplay commands, and the decision to play a cue. Presentation markers cannot grant rewards or advance narrative state.
- **Existing Kids RPG:** its production asset registry, static converter defaults, visual standards, content policy, save/PWA behavior, and rendering remain protected.

## 3. Approved formats and import contract

Runtime release format is self-contained GLB or glTF 2.0. GLB is the preferred shipped artifact. JSON glTF may be an import source, but conversion must resolve all dependencies locally and emit a self-contained release artifact. Development inputs FBX and OBJ must pass through an explicitly installed optional Blender conversion process to glTF before the same validation and normalization. `.blend` files use a pinned Blender batch export recipe. Do not add direct runtime parsers for FBX/OBJ or USDZ/STL/3MF in this phase.

P5.0 defines and tests an importer report and versioned, game-owned asset record before implementation. The record includes stable asset ID, schema version, source and output SHA-256, source provenance/license reference, importer and tool versions, conversion options, units/up-axis/facing/root transform, bounds, triangle/primitive counts, material and texture data, extension list, skeleton/joint/skin-weight summaries, morph target names, clip IDs/durations, output bytes, measured memory estimate, warnings, and approval status. Store license proof and private originals according to repository policy, outside public build output unless explicitly licensed.

Import is local/offline by default. Reject path traversal, remote URI fetches, absolute paths, unsupported required extensions, malformed containers/accessors, non-finite transforms/vertices, invalid indices, missing texture references, invalid skin joints/weights, unsafe dimensions, and values over pinned budgets. Normalize unit scale, up axis, and facing through a root transform. Preserve vertex data, textures, PBR materials, skin/skeleton bind data, morph targets, and clips for rigged inputs. Do not bake or strip animated data. Emit precise diagnostics with source path and failing field. Identical input under the same pinned tools/options must produce the same report and release artifact hash. If toolchains prevent byte-level deterministic output, define and test canonical semantic report equivalence and document the output variance before acceptance.

Use fixtures with explicit permissive licenses and source hashes: one textured static GLB and one genuinely rigged GLB with at least two named clips. Include invalid fixtures for malformed data, unsafe external reference, over-budget texture/geometry, and incompatible animation data. Never fetch untrusted inputs during tests.

## 4. Runtime API and resource contracts

Implement under `examples/scene-demo/src/animation/` or a sibling example-owned module. Do not export from `waypoint-rpg-*` packages in Phase 5. The reference adapter exposes only the minimum typed operations:

```ts
interface ModelAssetRecord {
  readonly id: string;
  readonly url: string;
  readonly sha256: string;
  readonly clips: readonly string[];
}
interface ModelLease {
  readonly root: Object3D;
  readonly clips: readonly AnimationClip[];
  release(): void;
}
interface ModelLoader {
  load(assetId: string, signal: AbortSignal): Promise<ModelLease>;
}
interface CharacterAnimation {
  setAction(action: SemanticAction, options?: { reducedMotion?: boolean }): void;
  dispose(): void;
}
```

The concrete shapes may use the installed Three.js types inside this example only. Asset IDs resolve through a validated allowlisted registry. Do not accept arbitrary URLs from UI or saved content.

Cache immutable geometry, materials/textures when safe, and source clips by content hash. Every live character gets an independently cloned skeleton and its own mixer/actions. A lease increments shared ownership. `release()` is idempotent, removes instance bindings/listeners, and decrements references. Free shared GPU resources only after the last lease releases. Integrate pending loads with SceneHost cancellation/generation. A late result releases immediately. Scene teardown releases mounted leases exactly once and creates no render loop or subscription after teardown.

Map movement, interaction, combat, and defeat state to semantic presentation actions at the consumer boundary. Animation does not modify gameplay state. If a clip is unavailable, use the registered fallback (idle or static pose) and report a developer diagnostic. Do not guess clip names. Blend and interrupt transitions deterministically. For demand rendering, request frames only while a visible mixer transition is progressing, then settle. Reduced motion uses static or shortened transitions while preserving the same committed state and meaning.

## 5. Cinematic timeline contract

Keep the timeline optional and game-authored. A validated sequence contains a stable ID/version and ordered bounded cues for camera staging, semantic animation, DOM dialogue synchronization, optional audio, and one explicit wait or player choice. Cues reference registered IDs, never arbitrary code or unrestricted gameplay effects. Reject duplicate IDs, missing targets, invalid duration, invalid ordering, and out-of-range camera parameters before playback.

The presentation runner owns only transient playhead/camera/input/audio state. `play`, `skip`, `cancel`, and `replay` are idempotent and keyed by a run identity. Skip moves presentation to the sequence's declared final pose and releases ownership. Cancel restores camera/input/audio and clears listeners. Scene invalidation cancels the run. Reduced motion skips decorative interpolation but preserves dialogue, choice, and state. Player choice submits through the normal game command boundary. Timeline cues cannot mark narrative choices applied, unlock maps, award items, write saves, or fabricate combat results.

## 6. Implementation milestones

### P5.0 — Baseline and architectural contracts

**Files:** `.plans/phase-5-model-animation-cinematics.md`, `docs/FRAMEWORK-ROADMAP.md`, asset fixture documentation, focused test baseline notes.

Fetch and verify `main`/CI, inspect instructions and existing package APIs, record local and CI baselines, pin import budgets and fixture licenses, and define report/manifest/lease/timeline contracts. Choose `examples/scene-demo` as the lifecycle host while keeping fixture presentation behind an independent route or test switch. Record a clean baseline and commit this scope.

**Gate:** contracts distinguish renderer-neutral authored data from Three.js instances; no existing package API or Kids RPG path changes; fixture licenses, provenance, budgets, and browser commands are recorded.

### P5.1 — Safe local model intake

**Files:** `scripts/model-import/` or equivalent small CLI module, importer tests/fixtures, example asset records, `docs/MODELS.md` additive section, scripts in root/package manifest only if required.

Implement `inspect`, `convert`, and `validate` for local GLB/glTF, with optional pinned Blender export adapters for FBX/OBJ/`.blend`. Use an established parser/optimizer only after checking its license, current support, security, and reproducibility. Keep optional Blender tooling out of runtime dependencies. Normalize axis/scale via root transform; preserve skin/morph/animation data. Emit a deterministic report and self-contained release GLB. Do not wire outputs into the Kids RPG registry.

**Gate:** approved static and rigged fixtures pass; malformed, unsafe, and over-budget fixtures fail with actionable diagnostics; repeated imports match the deterministic contract; output metadata includes hash, provenance, license reference, dimensions, and animation inventory; offline local imports pass.

### P5.2 — Rig instances and animation lifecycle

**Files:** `examples/scene-demo/src/animation/model-loader.ts`, `character-animation.ts`, `asset-records.ts`, tests, existing scene-host seam only where required.

Build the example-private loader/lease cache and per-instance skeleton/mixer. Connect semantic state to registered clips. Implement clip fallback, blend/interrupt, reduced motion, demand-render settling, pending-load cancellation, and exact disposal. Validate resource sharing and instance isolation using two live copies of one rig.

**Gate:** instances animate independently; one release cannot break the remaining instance; scene cancellation disposes late loads; repeated remount and transition cycles return resources to warmed baseline; no idle frame loop remains after actions settle.

### P5.3 — Optional staged sequences

**Files:** `examples/scene-demo/src/presentation/timeline.ts`, timeline runner and tests, accessible DOM cue integration.

Add typed validation and a small presentation clock; implement play/skip/cancel/replay, scene invalidation, reduced motion, camera ownership, audio cleanup, and keyboard-accessible choice. Keep gameplay outcome authority in the existing application reducer.

**Gate:** malformed cue references fail before playback; cancel/skip/replay clean up exactly once; a disabled-timeline run reaches identical durable gameplay outcome; timeline never writes or advances durable narrative/gameplay state on its own.

### P5.4 — Browser reference acceptance

**Files:** focused scene-demo browser tests, capture script/config, per-game/reference preview docs and provenance.

Render one textured static and one rigged fixture. Demonstrate two independently animated instances, a committed movement state selecting the expected clip, and one short optional sequence. Test failed/superseded asset load, scene transition/cancel, reload, context loss/recovery, reduced motion, mobile portrait, keyboard navigation, RTL presentation, and resource bounds. Extend the existing CI workflow with focused capture/lifecycle steps rather than cloning the full four-shard Kids RPG suite.

**Gate:** production-built Chromium source captures show real fixture assets; runtime and visual checks pass at documented desktop/portrait sizes; context recovery, memory bounds, offline asset loading, accessibility, and disposal pass. State exactly which Node/browser/device configurations were tested.

## 7. Verification matrix

| Area                               | Required evidence                                                                                                                                                                                                                                               |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Import structure and safety        | Valid GLB/glTF; bad header/chunk/accessor/index; missing/external/absolute/traversal texture; unsupported required extension; non-finite transforms; invalid skin/joint/weights; absent clips; oversized bytes, triangles, texture dimensions, and joint count. |
| Reproducibility and rights         | Same input/toolchain produces same recorded result; output is self-contained; source/output hashes match records; missing/unclear license prevents approval; no remote download/API requirement.                                                                |
| Instance and lifecycle             | Two instances of one rig have independent action time; release is idempotent; shared geometry releases at last owner; scene disposal, canceled load, superseded load, and context recovery release once; five warm remount/transition cycles stay bounded.      |
| State projection and accessibility | Committed movement/interact/combat/defeat chooses valid semantic action; absent clip fallback; reduced motion; Persian RTL DOM dialogue and accessible controls; keyboard operation and focus restore; touch target floor.                                      |
| Timeline                           | Validation errors; deterministic cue order; play, skip, cancel, replay; scene invalidation; audio/camera/input cleanup; no state/save/effect authority; gameplay works with timeline disabled.                                                                  |
| Existing regression                | `npm run verify`; `npm run framework:consumer`; `npm run framework:narrative-consumer`; `npm run framework:scene-consumer`; focused Chromium lifecycle/presentation tests; `npm run roadmap:sync`; `npm run roadmap:check`.                                     |

Measure file bytes, decoded texture sizes, triangle count, estimated and observed memory, render times, and `renderer.info.memory` before/after stress. Set fixture ceilings from P5.0's actual baseline device/browser and record the hardware. Do not invent mobile performance claims from SwiftShader. P5's package runtime support and browser/device support are claims only for versions directly tested.

## 8. Compatibility, rollout, and risk handling

Keep `waypoint-rpg-core`, `waypoint-rpg-narrative`, and `waypoint-rpg-gameplay` public APIs stable. No cross-package runtime dependency is added. Keep conversion outputs for current Kids RPG assets identical and verify existing asset registry, attribution, precache, and release behavior. Import and display approved assets only in the reference/sample consumer until each game's license review is complete. Keep source and generated files out of the production app's public root unless approved for that game.

| Risk                                                    | Detection and response                                                                                                                |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Generated glTF contains malformed or hostile structures | Reject before GPU upload using parser bounds and file/texture budgets; fuzz malformed fixture cases and cap decompression.            |
| Skeleton clone shares mutable bones/mixer state         | Assert per-instance skeleton identity and independent action clocks; retain source geometry immutably.                                |
| Cache leaks or double disposes resources                | Lease accounting, idempotent release, context-loss/scene-cancel tests, and warmed repeated-cycle probes.                              |
| Asset or tool license is unclear                        | Keep asset at specified/sourced status; do not ship until a reviewer records rights. Optional converter must have compatible license. |
| Import output drifts across tool versions               | Pin versions/options and persist provenance. Re-review hashes and performance when tools change.                                      |
| Screenshot baseline formatting blocks capture           | Keep run `45018058155` as existing failure, diagnose separately, and require step logs before attributing to P5 changes.              |
| Proposed adapter contract is too broad                  | Keep it example-private through P5.4. Extract only after a second independent consumer test demonstrates demand.                      |

## 9. Acceptance and handoff

P5 is complete when all five milestone gates pass, static and genuinely rigged source-rendered captures exist with provenance, the two rigs remain independently animatable, application state drives semantic animation, a short timeline is skippable/cancelable/reduced-motion compatible, all resources recover and dispose across cancellation and context loss, local import works offline, and the three existing packages and Kids RPG pass their compatibility gates. This proves an animated reference consumer. It does not prove every model provider, arbitrary skeleton retargeting, every browser, or a renderer package.

The implementation branch begins from the latest fetched `main`. Commit P5.0 through P5.4 as small local commits with exact test commands/results recorded in this plan. User authorization is required before pushing, opening a PR, deploying, or purchasing services. Phase 6+ remains in `docs/PRODUCT-RELEASE-ROADMAP.md`.

## Execution record

### Baseline on `693aae689065d108e84b85a16c5651d625c29ab2`

- Current GitHub `main` resolves to the recorded PR #116 merge SHA. The implementation worktree is `codex/phase5-animation-assets`; the existing planning worktree remains on `codex/phase5-roadmap`.
- The initial `npm run verify` exposed two existing root-gate issues. `scripts/sync-sample-gallery.mjs` failed Prettier and `e2e/sample-previews.preview.ts` failed ESLint because a runtime constant existed only for a type query. These were fixed in separate commits `3bc4e4e` and `6657db7` before feature work.
- After those fixes, `npm run verify` passed: formatting, roadmap check, lint (18 existing warnings), core/narrative/gameplay builds and boundaries, 15 core tests, 34 narrative tests, 29 gameplay tests, narrative tarball consumer, typecheck, 502 application tests, app build/content/assets/budgets/deploy checks, and hello-world/scene-demo builds.
- `npm run framework:scene-consumer` passed offline core+narrative tarball installation, typecheck, unit tests, Vite build, and Chromium lifecycle smoke.
- `npm run framework:watch:check` passed cold/warm linked builds, default Vite resolution, linked package updates, error preservation, and recovery.
- The planning baseline's screenshot workflow run `45018058155` failed at formatting before browser setup and capture. This failure predates the implementation branch; no screenshot result was inferred from it.

### P5.0 — architecture and baseline contracts

- Added `examples/scene-demo/src/animation/contracts.ts` with a renderer-neutral schema-v1 model record, source and output hashes, rights/provenance, normalized axis and bounds, fixture budgets, semantic clip mappings, and diagnostics. The module imports no Three.js or gameplay/narrative package.
- Added focused record validation and semantic fallback tests. `npx vitest run --config examples/scene-demo/vitest.config.ts` passed 41/41; `npx tsc --noEmit -p examples/scene-demo/tsconfig.json` passed. The repository-wide lint gate passed with 18 existing warnings.
- `npm run verify` passed after P5.0: all 506 application tests, core/narrative/gameplay package tests and builds, narrative tarball consumer, typechecks, content/assets/budget/deploy validation, and all three example builds.
- `npm run framework:scene-consumer` passed the offline core+narrative tarball install, typecheck, unit tests, Vite build, and Chromium lifecycle smoke.
- `npm run framework:watch:check` passed cold/warm linked builds, Vite's default linked-ESM resolution, multi-package HMR, error preservation, and recovery. No Vite resolver override is configured.
- Phase 5 is marked In progress in the canonical roadmap. The contract intentionally remains private to the independent example until another consumer proves a stable renderer API.

### P5.1 — local model import and runtime loading

- Added `scripts/import-model.mjs` and `npm run models:import`. The importer accepts local GLB and glTF 2.0, validates the GLB container, local dependency paths, supported extensions, geometry, textures, and skin data, applies root-level scale/up-axis/facing normalization, and emits a deterministic self-contained GLB plus provenance and inspection metadata. Missing license review, remote resources, unsafe paths, unsupported required extensions, malformed data, and configured size/geometry/texture/joint budget violations fail before release records are written. The importer does not fetch sources and does not require Meshy, a paid service, Blender, or Unity. FBX/OBJ/`.blend` conversion is not implemented; local Blender recipes remain optional follow-up work.
- Added self-authored MIT fixtures under `examples/scene-demo/fixtures/model-source/`: a textured static GLB and a skinned GLB with two joints, skin weights, embedded texture, and four real animation clips (`idle`, `move`, `interact`, `combat`). Fixture provenance and reproducibility are checked by `generate-phase5-fixtures.mjs --check`. Imported outputs live only in the independent scene consumer's `public/models/`; the Kids RPG registry, static conversion output, and PWA precache were not changed.
- Added an example-private integrity-checked loader and reference-counted source cache. Each lease receives a skeleton clone and deep per-instance resource copies; cancellation releases late parse/fetch results, and idempotent lease release disposes only instance-owned resources while retaining the source cache. The `?phase5=assets` reference route renders the actual static and skinned GLBs and exposes load/readiness state.
- Added model import tests (8/8), loader tests (4 focused lifecycle/cache/error tests), contract validation tests, and production Chromium smoke assertions for both real models, clip inventory, reload, and absence of external model requests.
- Verification passed: `npm run format:check`; `npm run roadmap:check`; `npm run lint` (0 errors, 18 pre-existing Fast Refresh warnings); `npm run models:import:test` (8/8); `node examples/scene-demo/scripts/generate-phase5-fixtures.mjs --check`; `npm run verify` (all gates green, 511 application tests, core 15, narrative 34, gameplay 29); `npm run framework:scene-consumer` (offline package install, typecheck, unit tests, production build, Chromium consumer smoke); `npm run framework:watch:check`; and `npm --prefix examples/scene-demo run test:e2e` (production Chromium narrative/persistence/lifecycle plus static/rigged model load and reload smoke). `npx tsc --noEmit -p examples/scene-demo/tsconfig.json` and the focused scene-demo Vitest suite (46/46) also passed. Builds report the existing large-chunk warning; no new runtime package dependency was introduced.
- P5.1 does not yet prove per-instance animation playback, game-state action selection, cinematics, context-loss recovery with a live mixer, or source-rendered gallery capture. Those remain P5.2–P5.4 gates. The added importer tooling dependencies are development-only and do not enter the Kids RPG production bundle.

### Post-merge P5 stabilization — CI, model ownership, and animation completion

- Rebased stabilization work on fetched `origin/main` at `1ae9946bd280caa6847e78d6a9b32180a3499ad8` (PR #119). Baseline CI showed the Node 22.0.0 gameplay smoke passed an encoded snapshot where `encodeGameplayState` requires the compiled definition; the Blood Leaf preview still expected the former `lantern-interaction` UI; and roadmap automation failed because GitHub Actions lacked permission to create PRs. These were repaired in a separate CI commit. Roadmap verification remains PR-based; without the optional repository variable `FRAMEWORK_ROADMAP_AUTOPR=true`, the workflow publishes a patch artifact and summary instead of attempting a disallowed PR creation.
- The preview capture now follows the actual suspended-courtyard → workshop clue → resolved-clue path and verifies the persistent consequence. `npm run sample:scene:previews` passed in production Chromium and refreshed the source-rendered preview captures.
- Runtime loading is restricted to self-contained GLB 2.0. The loader validates the container and rejects external buffer/image URIs before invoking Three.js. Local glTF source files and their contained resources remain accepted by the offline importer, which emits the single runtime GLB. The game's existing static `--no-anim` pipeline is unchanged.
- Model instances now render a lease only when its asset/instance/loader identity matches current props. Regression coverage includes rapid asset replacement, stale lease suppression, delayed load, abort, failed request/retry, late parse disposal, and repeated reload. Source cache ownership and independently cloned resources remain reference counted.
- Animation `idle` repeats twice and settles for demand rendering; move/interaction/combat use one-shot playback and return to idle; defeat can hold its final pose. Crossfade interruption stops the outgoing action; reduced-motion applies the target pose without a continuing frame request.
- P2 verification: `npm --prefix examples/scene-demo run test -- src/animation` passed (5 files, 26 tests); `npm --prefix examples/scene-demo run typecheck` passed; `npm run format:check` passed; `npm run example:scene-build` passed (existing large-chunk advisory); and `npm --prefix examples/scene-demo run test:e2e` passed in production Chromium, including delayed asset switching, cancellation, HTTP error/retry, stale-root suppression, repeated canvas reload, and the existing story/persistence lifecycle. A default-sandbox Vitest attempt hit Windows `spawn EPERM`; the same focused command passed with the required execution permission.
- The workflow permission branch itself cannot be validated on GitHub until the repository owner chooses whether to enable `FRAMEWORK_ROADMAP_AUTOPR`; the safe artifact fallback is the default. P5.3 and real third-party licensed model acceptance remain outstanding.

### P5.3 — rendered optional timeline

- Added `src/presentation/timeline.ts` as a dependency-free example-side timeline definition compiler/player. It validates stable cue IDs, cue ordering, durations and camera/action/dialogue/audio cue data; execution is deterministic, cues are emitted once, and state supports play/replay, pause/resume, skip, and cancel. Authored cue objects and arrays are cloned/frozen; timeline state is transient and never writes narrative/gameplay state.
- Added an actual R3F camera stage, an imported-guardian interaction clip, and a Persian RTL DOM dialogue cue to `?phase5=assets`. Keyboard-operable controls cover play/replay, pause/resume, skip and cancel. Cancellation restores camera framing and idle poses; Canvas unmount cancels the active sequence. Reduced motion applies all cues in order on one rendered frame, so meaning remains while interpolation is removed. Audio cue records are supported by the timeline contract, but this example has no reviewed sound asset and therefore does not author playback audio.
- Timeline unit tests passed (5/5), scene-demo typecheck passed, and `npm run example:scene-build` passed (existing >500KB Three.js chunk advisory). Production Chromium `npm --prefix examples/scene-demo run test:e2e` passed with keyboard playback/pause/resume/skip/cancel, camera movement and restoration, Persian RTL captions, reduced motion, existing story/persistence checks, and model load/cancel/retry/remount checks. Two earlier smoke attempts exposed test timing assumptions (controls can reflow and cue batches process on the next demand frame); the test now uses keyboard activation and waits for the actual cue/camera commit. No runtime defect remained.
- P5.3 includes a real rendered sequence. P5.4 has now added and browser-tested a pinned external static/rigged asset pair, context recovery, and renderer-memory bounds. The P5.4 gate remains open for committed source-rendered cinematic/model screenshots and the Kids RPG PR #119 regression acceptance.

### P5.4 — external assets and lifecycle acceptance (in progress)

- Added external Khronos glTF Sample Assets **Box** and **Rigged Figure**, pinned to `e124e8d8d7330a5372bc2b4d00d39a4a9d7997ea`. The upstream model readmes and repository licensing inventory identify both as © 2017 Cesium, CC BY 4.0, attribution “Cesium for Everything.” Source bytes and sidecars remain local fixtures; normalized GLBs are bundled only in the independent consumer. No Meshy account, network runtime request, or Kids RPG registry/PWA change is involved. Source SHA-256s: Box `ed52f7192b8311d700ac0ce80644e3852cd01537e4d62241b9acba023da3d54e`; Rigged Figure `d6be85417d3e256861ee733eea6916093a7af7c79c16366181fd8abcaeb38cf5`. Imported outputs: Box `a052de8729a6d1ee6cf7977664da7cc1eb6d9a80da2387f69c1e8485b1cab84b`; Rigged Figure `15fdf90c98ee6aca863d769f177c54de7639311514a29d28f30c04731697c3c0`.
- The real Rigged Figure has one skin with 19 joints and an unnamed 57-channel animation. That revealed a deterministic importer defect: metadata called the clip `clip-1`, but the written GLB retained the empty name, so the runtime semantic mapping could not resolve it. The importer now writes the stable generated name into the GLB; the actual-file regression test verifies the named 57-channel animation and skin.
- Production Chromium now loads both external assets, checks the renamed animation, selects the external rigged asset for both game characters and confirms their `Skeleton` instances are distinct, then switches back to the four-clip fixture used for game-state and timeline checks. It also forces WebGL context loss, recovers through a user-visible control, reloads the scene during a cinematic (which cancels it), and performs three further Canvas remount cycles.
- The renderer memory probe is sampled after a warmed render. In Chromium/SwiftShader it recorded 4 geometries and 5 textures before the three repeated remounts and the same 4/5 afterward. This is a bounded lifecycle result for that headless environment only; it is not a physical-device performance claim.
- `npm --prefix examples/scene-demo run test:e2e` passed the combined narrative/save/model/animation/timeline/context/reload path. The local static and rigged GLBs produced no external asset requests. Separate actual screenshot artifacts, Kids RPG PR #119 regressions, and full verification remain outstanding.
