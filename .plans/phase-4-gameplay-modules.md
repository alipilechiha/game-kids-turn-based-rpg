# Phase 4 — Reusable Gameplay Modules and Tactical Combat

## Status and scope

Approved execution plan for P4.0–P4.6. This phase closes the specified Phase 3 gaps, introduces an optional game-neutral `waypoint-rpg-gameplay` package, verifies its installed tarball before application integration, and exercises it in the independent Three.js scene-demo. The package contains deterministic gameplay logic only. It is not a renderer, and this phase does not complete combat cinematics or a general-purpose Three.js RPG engine.

Keep `packages/core`, the Kids RPG application/domain/content/save contracts, and the existing scene-demo rendering/lifecycle behavior unchanged. Do not add direct dependencies between narrative and gameplay. Do not push, publish, open a PR, or merge. Commit scoped milestones locally.

## Baseline and source audit

- Refresh `origin/main` before work; current fetched baseline is `91a4544a16f9e3d5e44a461ad069a30dff6162d2` (PR #114). Baseline remote roadmap-sync and Pages workflows passed; all four E2E shards and `framework-consumer` passed. Local baseline used Node `v22.23.5` / npm `10.9.9`; `npm run verify` passed after repairing a Windows CRLF mismatch in the roadmap sync check and formatting its merged script. The repair is tracked as repository workflow hygiene, not game behavior.
- `packages/core` is a zero-runtime-dependency ESM package. Its runtime reducer returns state and notifies subscribers even when a rejected action preserves identity; it is not a typed command-result or persistence coordinator. Phase 4 will not modify it.
- `packages/narrative` is an optional zero-runtime-dependency ESM package with root-only exports, conditions, ordered atomic effects, quest/dialogue transitions, durable state, and an installed tarball consumer. It does not depend on core, React, Three.js, or browser APIs. Current `clear-flag` writes `false`; no operation yet removes an optional fact override. The validator detects only unconditional `active` quest dependencies. Its package remains independently usable.
- `examples/scene-demo` owns a two-scene R3F app, registry, `SceneHost`, bootstrap/save runtime and DOM dialogue UI. `SceneHost.start(mapId, entryAnchorId?)` already validates anchor ownership/walkability and cancels superseded loads. Demo envelope v1 stores content/compatibility versions, map+anchor, and narrative snapshot; storage access stays in the demo. The current Blood Leaf truth choice starts and immediately completes the inquiry before the workshop clue; a lantern trigger is not the approved guarded clue dialogue. Save restore can load a saved anchor, but the UI has no retry for a failed restore.
- The existing app reducer and runtime already separate durable narrative/location identity from transient feedback and reject UI-ineligible commands at the application boundary. Phase 4 extends this seam with gameplay, captured revisions, session/playthrough/instance tokens, and a single transactional durable application snapshot.
- Kids RPG battle code (`src/framework/modules/battle/`) is an application reference, not a generic rules source to extract. No files under `src/domain/`, `src/framework/`, Kids RPG content, or its save implementation are in scope.
- CI currently prepares/builds core and narrative separately and has a Node 22.0.0 native-runtime probe. Phase 4 will prepare core+narrative+gameplay and build/pack each required archive once on Node 22.22.2, then reuse byte-identical archives in standalone and combined consumers. Node 22.0.0 will execute native ESM compatibility probes only, without npm/build tooling. The canonical roadmap is `docs/FRAMEWORK-ROADMAP.md`; update it and regenerate/check the README using `npm run roadmap:sync` and `npm run roadmap:check`.

### Existing capabilities and gaps

| Area      | Reuse                                                                                                                               | Phase 4 work                                                                                                                                                             |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Runtime   | Existing package build conventions, NodeNext ESM, root-only exports and consumer scripts                                            | Optional gameplay package, separate from core and narrative                                                                                                              |
| Narrative | Existing playthrough/revision guards, typed facts/effects, ordered quest transitions, one suspended dialogue, app-owned persistence | Complete-status dependency analysis, declared fact types/defaults/locale fallback, override clearing, dialogue handoff, old-save migration and cross-package transaction |
| Scenes    | Existing validated start-at-anchor, one canvas, asynchronous load cancellation, retained current scene on failure                   | Retry same restored map+anchor; guard stale results against reset/session epoch                                                                                          |
| Demo      | Existing session-only recovery, Persian DOM controls, scene transitions and tests                                                   | Correct cross-scene clue story; gameplay command eligibility, encounter and persistence                                                                                  |
| Kids RPG  | No runtime dependency on the optional packages                                                                                      | No migration or behavior changes                                                                                                                                         |

## Package and dependency architecture

Create `packages/gameplay/`, package identity `waypoint-rpg-gameplay`, with pure TypeScript ESM, strict NodeNext declarations, source maps, one public root, no runtime dependencies, and no imports from core, narrative, React, Three.js, browser/storage, or app source. Do not split inventory/combat/abilities into more packages. Definitions and runtime state are validated, JSON-safe, immutable snapshots; authored content contains data, never callbacks, scripts, `eval`, or arbitrary effect dispatch.

```text
scene-demo application
  ├─ waypoint-rpg-core (optional runtime/scene primitives)
  ├─ waypoint-rpg-narrative (optional story rules)
  ├─ waypoint-rpg-gameplay (optional progression/combat rules)
  ├─ app reducer/coordinator (atomic integration, eligibility, save ownership)
  └─ scene host, DOM/R3F presentation and authored game content
```

Narrative and gameplay are peers, not dependencies. Only the application adapter understands that a verified gameplay terminal result can map to an authored narrative trigger. A UI caller cannot submit internal kit grants, enemy actions, or verified outcome triggers.

## Gameplay API and state model

The package exposes a small root API: `validateGameplay`, `compileGameplay`, `createGameplayState`, `decodeGameplayState`, `transitionGameplay`, deterministic view/legal-action selectors, terminal result queries, and bounded enemy action selection, plus definition/state/command/result types. Compiled data is defensively copied and frozen; indexes remain private. Definitions, package-state schema, and compatibility keys are versioned independently from the app save envelope. Copy/presentation edits do not invalidate progress; incompatible structural changes are rejected with original stored bytes preserved. No general arbitrary migration mechanism is required.

- **Character/progression:** stable IDs; authored base integer attributes and caps; safe XP thresholds derive level, attributes and explicit unlocked abilities; health/resource bounds; deterministic accepted updates.
- **Inventory/equipment:** stable item IDs, stack/unique rules, optional capacity, atomic acquire/consume, game-defined equipment slots, ownership/compatibility/requirements, and recomputed modifiers (no duplicated derived stats). Invalid quantity, capacity, ownership or modifier bounds reject without partial mutation.
- **Abilities/status:** typed costs, prerequisites, target/range rules, bounded effects, cooldown/use limits only where the demonstration needs them. Statuses have explicit stacking (`refresh`/`ignore`), safe effect order, and duration measured only in the holder's subsequent completed turns. A self-applied status cannot expire in its creation turn; refresh/ignore, terminal combat, and mid-duration reload are tested.
- **Tactical combat:** bounded logical grid (implementation target 5×5, hard max 8×8), at most eight combatants, stable initiative and actor tie-breaks, one validated move/ability/wait per turn. Movement uses shortest deterministic four-direction path, fixed neighbor tie-break, and path length no greater than effective movement; blocked and occupied cells are excluded. No frame timing, animation callbacks, or `Math.random()` in transitions.
- **Enemy turns:** deterministic prioritized legal command selection: attack an in-range valid target; otherwise move toward the nearest reachable target with stable ties; otherwise defend/wait. Enemy decisions are ordinary internal commands validated by the same transition API.
- **Encounter lifecycle:** authored encounter definitions have stable reusable IDs; each started playthrough receives a separate stable unique encounter-instance ID. Outcome/reward markers are scoped to playthrough+instance. Terminal actions reject afterward; retry/replay cannot duplicate rewards, but another playthrough may reuse a definition.

Every public player intent captures playthrough ID, encounter-instance ID, session epoch and expected gameplay revision when input is created. Execution never silently rebases stale input. Each accepted public action and each internally generated enemy action advances the gameplay revision exactly once on the private candidate; internally generated actions use that latest candidate revision. A stale/duplicate action preserves snapshot identity and revision.

## Phase 3 stabilization and content compatibility

### Quest dependency cycles

Treat authored predicates for `active`, `completed`, `failed`, and `cancelled` as positive dependencies requiring the target quest to start. Preserve bounded conservative analysis: `all` combines mandatory dependencies, `any` records possible/mandatory alternatives, and dependencies under `not` are not positive edges. Reject definitely unsatisfiable unconditional cycles, including self-cycles and multi-quest cycles. Warn where `any`, condition-dependent facts, or negation make static satisfiability uncertain. Do not reject legitimate dialogue cycles.

### Facts and definition evolution

Add optional declarations for boolean, safe integer, and string facts plus validated defaults, and optional explicit default locale, without breaking definitions that omit them. Exact requested locale wins, then its base language, then the declared default locale; if no default was authored, preserve legacy deterministic fallback. Keep `clear-flag` as an explicit false assignment. Add a distinct operation that removes an optional override and restores the declared default (or absence if no default). Materialized defaults in new/hydrated snapshots do not change revision and do not cause a storage write by themselves. Decode rejects undeclared fact IDs/types for definitions using declarations while retaining legacy facts for old undeclared definitions.

Distinguish narrative `schemaVersion`, definition `contentVersion`, structural `compatibilityVersion`, gameplay package state/schema versions, and application envelope version. Compatible localized copy or presentation updates do not discard progress. Incompatible structure or saved payload: do not hydrate it into a different structure, auto-migrate, write, or erase; retain original bytes and offer explicit recovery. Phase 4 migrates only known Phase 3 envelope v1 into current envelope v2 using an explicit pure adapter; no general migration framework.

### Dialogue handoff and Phase 3 saves

`closeDialogue` is a non-ending terminal: it clears active and suspended cursors, applies no effects, sets no global ending, and cannot replay effects. Only terminal nodes with `endingId` can finish the playthrough. Correct Blood Leaf: truth starts but does not complete the inquiry; a guarded workshop clue dialogue applies the clue consequence and completes once; returning to the courtyard opens a distinct guarded resolution dialogue, then a truth ending is available. Vengeance retains a distinct failed quest and valid ending. A fresh playthrough cannot reach truth ending before clue resolution.

Keep one suspended dialogue. If it blocks another interaction, expose its owning scene and short Persian instruction to return, resume, or finish it. Test courtyard→workshop and workshop→courtyard interruptions, reload, cursor cleanup, no repeated effects, and valid grandfathered endings.

For every reachable Phase 3 runtime cursor, create fixtures by invoking the actual v1 narrative and scene-demo codecs, not by guessing payload shapes. Record active/suspended target dialogue+node, scene/map+anchor, quest/facts, applied choice/trigger history and legal next command for all reachable states, including active/suspended, completed/failed quest, lantern lit/unlit and both endings. The old ending choice is already applied: pending old truth-ending cursors must map to a directly finishable terminal without replaying that choice. Old unlit truth progress can resolve the new clue without completing a completed quest twice. Workshop saves with suspended courtyard dialogue can return and resume/complete their owner. Migration is pure, deterministic, idempotent, preserves playthrough ID/revision/progress and immutable ending, and never writes automatically. Unknown/incompatible/corrupt bytes remain unchanged.

### Save recovery

If a valid stored map+anchor fails to load, retain the exact bytes and show retry for that same validated destination. No playthrough replacement or persistence occurs until scene restoration commits. Show a visible session-only notice whenever storage is unavailable, writes fail, or reset cannot remove the old save. On reset-clear failure, keep the new playthrough session-only, autosave disabled, and preserve the old bytes through subsequent gameplay.

## Cross-package transaction and command boundary

The demo app keeps one authoritative durable application snapshot containing gameplay, narrative, committed location, playthrough/session epoch, reward markers and committed envelope revision. UI/dialog presentation and command correlation tokens are separate transient state. Rejection and presentation-only updates preserve durable snapshot identity. Persistence follows only a validated durable commit, never store notification or feedback identity.

For one public combat intent, evaluate against private candidates in this order: validate captured command identity/revision and application eligibility; apply player action; process any deterministic enemy turns using candidate revisions; determine outcome; apply the entire preflighted victory reward bundle when applicable; apply mandatory verified narrative result mapping; validate all candidate snapshots. Publish one durable snapshot only if all required stages succeed. On any rejection/fault, retain the original gameplay and narrative objects, revisions, inventory/XP, turn, and reward markers, then report a transient feedback result correlated to that exact submitted token. Retry with the same valid captured intent is allowed only after a failed transaction and has the same deterministic result. Test injected narrative rejection after candidate victory and after a candidate defeat from an enemy action; both fully roll back and can retry. No enemy-action victory mechanics are added.

At encounter start, preflight the complete victory reward bundle against capacity, item stack/unique constraints, equipment ownership, XP/revision bounds and all required outcome mappings. Mapping guards are restricted to facts/quest context valid at encounter start so the preflight is sound; preflight is side-effect-free and actual terminal mapping is revalidated at resolution. Reject invalid encounter definitions/start with precise diagnostics, not a legal winning action at resolution. Freeze or guard facts, inventory/equipment, grants, travel and other assumptions while combat is active. Cover victory after player action, defeat after internally generated enemy action, turn-limit defeat, and withdrawal where supported.

The application boundary rejects commands during bootstrap, reset, invalidated session, pending scene transition, active combat when ineligible, wrong scene/playthrough/encounter instance, and stale revisions. Enemy actions, kit grants, and verified combat outcome triggers are private internal commands; no arbitrary effect dispatch is exported to UI.

## Save envelope and startup

Keep all storage I/O application-owned. Keep envelope v1 decoding for Phase 3 progress and encode envelope v2 only after supported migration/session commit. Gameplay-only and optional package absence must not invalidate narrative-only consumers. Startup stays command-ineligible and autosave-disarmed until the v1/v2 bytes and package snapshots validate, migration completes in memory, and the validated map/anchor commits. Only then publish the initial durable snapshot and enable eligible gameplay. Migration/default materialization itself never writes. Mid-combat restore includes playthrough and encounter instance, turn/positions/resources/status duration, rewards/outcome markers, narrative, committed map+anchor, and revisions. Reset during combat/transition invalidates old session epoch and cancels its scene load before the replacement may commit. A failed storage removal yields session-only mode with autosave off; old bytes are never overwritten by later gameplay.

## Six milestones, commits, and gates

Each listed sub-milestone is a narrowly scoped local commit. Keep the order; P4.3 must pass before P4.4 imports gameplay in the demo.

### P4.0 — Close Phase 3 correctness gaps (six focused commits)

1. **P4.0a — Baseline roadmap hygiene:** preserve canonical docs→README generation on LF/CRLF, keep `roadmap:check` green, and record clean `npm run verify` baseline.
2. **P4.0b — Quest-cycle analysis:** add status-cycle detection and focused validator tests.
3. **P4.0c — Fact declarations/defaults:** compatible schema, safe typed defaults, locale fallback, fact decoding, clear-flag vs clear-override and hydration identity tests.
4. **P4.0d — Story handoff/migration:** corrected clue/resolution content; close dialogue semantics; actual v1 encoder fixtures and exhaustive cursor mapping; suspended-dialogue guidance and reload tests.
5. **P4.0e — Restore retry/storage notices:** retry saved map+anchor; preserve bytes until commit; storage/reset/write failure tests.
6. **P4.0f — CI package/runtime baseline:** narrative-only package gate if missing; exact Node runtime floor probes; roadmap status synchronization.

**Gate:** `npm run verify`, focused narrative/demo tests, `npm run roadmap:check`, applicable scene browser story/accessibility coverage; Kids RPG contracts unchanged.

### P4.1 — Gameplay definitions and package boundary (one commit)

Add workspace manifest, strict ESM declaration build, public API, typed definitions and validator/immutability boundary for stats/progression, items, slots/modifiers, abilities/statuses, board and encounter/reward/outcome definitions. Add dependency/import-policy tests and exact root export tests. Do not import it in scene-demo.

**Gate:** boundary, schema, malformed/non-JSON/unsafe key, duplicate/missing references, numerical bounds and immutable compiled input tests; clean package build.

### P4.2 — Pure gameplay state machines (four focused commits)

1. **P4.2a — Progression, inventory, equipment:** bounded XP/derived levels, explicit unlocks, stack/capacity/unique ownership, atomic equip/unequip and non-accumulating recomputed stats.
2. **P4.2b — Tactical board, abilities, status:** command legality, range/resource use, deterministic four-way movement budgets/ties/blocks/occupancy, status stacking and subsequent-turn expiry including mid-duration reload.
3. **P4.2c — Enemy policy, outcomes, instances and reward preflight:** bounded deterministic enemy commands, terminal outcome/revisions, reusable definition vs unique instance, preflight complete rewards and all mappings; no duplicate rewards.
4. **P4.2d — State decoding and replay contract:** versioned immutable state codec; deterministic full transcript; stale/same-revision commands; arithmetic bounds; terminal and reload rejection.

**Gate:** package unit suite for every transition, atomic rollback, identity on invalid commands, deterministic replay and decode/restore; package still has no runtime dependencies.

### P4.3 — Standalone tarball verification (one commit; pre-integration hard gate)

Build/package gameplay independently; copy tarball outside repository; install offline after any dev tools are already installed; verify native ESM runtime, root exports, NodeNext and Bundler declarations, negative deep imports, archive/dependency contents and native minimum Node 22.0. Reuse byte-identical package archives for standalone and later combined consumer checks. Do not integrate before green.

**Gate:** independent consumer passes without source aliases or monorepo workspace resolution; Node 22.0 executes only ESM runtime probes, never npm/build tooling.

### P4.4 — Independent 3D consumer integration (one commit)

Add app-owned transactional adapter, command-boundary eligibility, captured revisions/tokens, verified outcome mapping, and a compact original Persian DOM-accessible encounter to scene-demo. Keep one R3F canvas, demand rendering, existing scene host/camera/disposal/context recovery, scene transitions, and child game separate. First prove the scenario using session-only demo tests before enabling regular UI. Add two outcomes: victory follows a player action; defeat follows an internal enemy action. Include rollback fault injection and retry, plus keyboard/RTL browser checks.

**Gate:** no direct package dependency between narrative/gameplay, no forged internal actions, atomic single durable commit, scene lifecycle acceptance unchanged.

### P4.5 — Persistence and compatibility (one commit)

Encode envelope v2 after commit; decode/migrate supported Phase 3 v1 fixtures as specified, preserve corrupt/unsupported/incompatible bytes, hydrate mid-combat and terminal states, restore committed map+anchor, session reset/transition invalidation, exactly-once reward/outcome markers and session-only failures.

**Gate:** actual old-codec fixtures for every reachable cursor/state class; pure idempotent migration; no pre-hydration write; no stale scene or subsequent autosave can overwrite old bytes; fresh, mid-combat, victory/defeat, cancellation and reset tests.

### P4.6 — Full verification, documentation and release compatibility (one commit)

Update gameplay/core/narrative API docs, getting-started, scene-demo README, package README, canonical roadmap, generated README. Rework the existing framework CI job (do not duplicate whole workflows): install core/narrative/gameplay development workspaces once on Node 22.22.2; build and pack each required tarball exactly once; pass those identical archive files to standalone package gates and combined 3D consumer; run native ESM compatibility probes only on Node 22.0.0; keep existing E2E shards and Pages workflow. Do not configure Vite resolver overrides unless default linked-package handling demonstrably fails.

**Gate:** full `npm run verify`; core/narrative/gameplay boundary+unit+tarball gates; combined offline install, declarations, Vite build, browser smoke; focused existing scene/browser tests; `npm run roadmap:sync` then `npm run roadmap:check`; clean task-scoped worktree and seven-phase roadmap accurately distinguishes delivered vs proposed features.

## Test matrix and acceptance criteria

### Narrative stabilization

- Direct self-dependency; two-quest completed cycle; three-quest mixed-status cycle; viable `any`; dependency under `not`; correct error vs warning; intentional dialogue cycle.
- Declared boolean/integer/string facts, typed defaults and invalid saved keys/types; undeclared legacy definitions; exact/base/default locale; `clear-flag` stores false while clearing override restores default/absence; hydration creates no revision/write.
- Correct truth clue and courtyard resolution; no fresh truth ending before clue; vengeance failed result; one-time effects, close vs global finish; grandfathered ending immutability.
- Phase 3 actual-codec fixtures across every reachable dialogue cursor, active/suspended status, quest/fact/trigger/choice history, map+anchor, lantern state and ending; pending already-applied ending choice directly finishes; old unlit truth reaches clue; completed quest never completes again; each migration deterministic/idempotent and non-writing; both suspension directions/reload show owning scene and instruction.
- Failed saved-scene retry targets original validated map+anchor; no save until committed; storage unavailable/write/reset failure displays session-only status and retains original bytes through subsequent play.

### Gameplay package

- Definition structure/versions/immutability; no package/import leaks; character XP thresholds/caps/unlocks; inventory stack/unique/capacity and atomic acquire/consume; equip requirements/ownership/slot compatibility and stable derived stats.
- Ability legality/cost/range/effect order; status refresh/ignore, holder subsequent-turn expiry (self and other actor), terminal behavior and mid-duration reload.
- Initiative, stable tie-breaks, shortest 4-way paths, exact movement limit, over-limit, blocked, occupied, deterministic path ties; enemy attack/move/defend/wait policy.
- Invalid command identity/revision; two same-revision intents, delayed input, post-reset/session invalidation, prior encounter instance; no rebase; turn/revision overflow; immutable/replay deterministic outputs; no terminal overwrite.
- Full outcome/reward preflight (capacity, stack/unique, equipment owner, XP and mandatory mappings); no legal win that fails only at victory; duplicate terminal/reward replay does not award twice; same authored encounter reusable in a later instance/playthrough.

### App transaction, restore, and browser

- Cross-package candidate-state atomicity and one durable publish; injected narrative outcome mapping failure after candidate victory and after enemy-action defeat preserves gameplay/narrative identities, revisions, inventory, XP, turn and markers, then retry succeeds once. Include turn-limit defeat and withdrawal mapping where enabled.
- Scene/playthrough/session/revision eligibility enforced at app boundary, never only disabled controls. UI cannot issue enemy, kit, or verified outcome internals. Reset invalidates/cancels old scene load; delayed callbacks and previous instance reject.
- Phase 3 envelope v1 loads with defaults and narrative history; v2 mid-combat restore is exact; corrupt/unsupported/incompatible original bytes remain; reset remove failure cannot autosave over prior bytes.
- One persistent R3F canvas; courtyard/workshop branch, trial/encounter and world/narrative consequence; transition cancellation, failed restore retry, disposal/subscription/demand-render/context recovery; Persian RTL DOM controls, accessible names, keyboard/focus order and actual visual ordering.
- Full Kids RPG `npm run verify` and existing Playwright jobs remain green; no Kids RPG source/save/PWA/content policy changes. No new gameplay or narrative/core coupling.

### Compatibility language

Acceptance reporting must distinguish: (1) **offline package installation** from local archives with no registry access; (2) **development-tool installation** that may need npm registry/cache and runs only on Node 22.22.2; (3) **Node runtime compatibility** for native package ESM at declared Node >=22.0.0, with Node 22.0 probes doing no build; and (4) **browser compatibility**, which is demonstrated only for the Chromium/WebGL configurations actually run. Root/workspace engines and build-time requirements do not imply broader package or browser support.

## File-level implementation map

- `packages/narrative/src/{definition,validate,compile,state,transition}.ts`, narrative tests/README: Phase 3 defects, schema-compatible facts/defaults, `clear-fact`, cycle analysis, close terminal, fixtures/migration helpers where truly package-owned.
- `examples/scene-demo/src/content/blood-leaf.ts`, `runtime.ts`, `persistence.ts`, `scene-host.ts`, `App.tsx`, `DialogueDialog.tsx`, scenes/styles/tests and `examples/scene-demo/scripts`: story handoff, retry, app transaction/eligibility/session/save ownership and accessible 3D consumer.
- `packages/gameplay/{package.json,tsconfig.build.json,src/*.ts,test/*,scripts/check-boundary.mjs,README.md}`: package definitions, pure transitions, state codec, focused tests and root boundary.
- root `package.json`/`package-lock.json`, `.github/workflows/e2e.yml`, `scripts/check-framework-gameplay-consumer.mjs`, shared archive preparation/support and runtime probes: workspaces, build orchestration, one-time archives, standalone/combined consumers, version gates.
- `docs/FRAMEWORK-ROADMAP.md`, `docs/framework-api.md`, `docs/getting-started.md`, `examples/scene-demo/README.md`, package READMEs and generated `README.md`: implemented APIs/status/evidence.
- Never edit `packages/core/`, `src/domain/`, `src/framework/`, production Kids RPG content, save schemas, PWA, asset registry, or GLBs for this phase.

## Deferred work and known limitations

No general renderer/physics package, cinematics, arbitrary event bus/scripts, AI service/behavior-tree framework, uncontrolled RNG, broad save-migration platform, New Game+/multiple profiles, account system, combat integration into the Kids RPG, multi-package gameplay decomposition, large new model/animation pipeline, or non-Chromium/device-support claim. Phase 4 proves optional reusable gameplay rules in one independent 3D validation consumer only. The current Kids RPG and Phase 1 core stay independent and unchanged.

## Execution record

Append each locally committed sub-milestone SHA with exact tests and result after its gate passes. Do not mark a gate complete before observing it. No remote push/PR/merge is authorized.

### Completed locally

- **P4.0a** — `9027579` (`fix: make roadmap sync line-ending safe`). `npm run verify` passed, including canonical roadmap regeneration/check; no application contract changes.
- **P4.0b** — `ad55b51` (`fix(narrative): detect terminal quest prerequisite cycles`). Narrative suite passed 27/27 with direct self, completed/failed/cancelled mixed cycles, viable alternatives, negation and conditional-warning coverage.
- **P4.0c** — `20e6f27` (`feat(narrative): declare typed facts and locale defaults`). Narrative suite passed 32/32; narrative package build and independent tarball consumer passed.
- **P4.0c verification follow-up** — `4731425` (`test(narrative): use portable fixture cloning`). Required after full lint found `structuredClone` missing from lint globals; the portable JSON fixture clone restored a green lint gate.
- **P4.0d close semantics** — `0e58121` (`feat(narrative): support non-ending dialogue closure`). Narrative suite passed 34/34; close clears only the cursor, preserves story/quest state and cannot replay effects.
- **P4.0d story and migration** — `ebfed68` (`fix(scene-demo): migrate Phase 3 story progress safely`). Actual Phase 3 encoder fixtures cover 26 reachable cursor/state classes; scene-demo tests passed 35/35 at commit, Chromium narrative/accessibility/lifecycle smoke passed, and full `npm run verify` passed (499 application tests). The truth clue is required before fresh truth resolution; legacy already-applied ending cursors finish directly; both suspended-dialogue directions survive reload.
- **P4.0e** — `e053484` (`fix(scene-demo): preserve saves during retry and reset`). Scene-demo typecheck passed; unit suite passed 37/37; Chromium smoke passed with visible session-only recovery and silent reset-clear failure preservation; full `npm run verify` passed (502 application tests, package gates, production and example builds).
- **P4.0f verification** — `34a2d07` (`ci(framework): verify narrative package runtime compatibility`). The workflow now runs the narrative-only tarball consumer, exports that exact archive for the combined scene consumer, and prepares core+narrative runtime installs on Node 22.22.2 before the direct Node 22.0.0 ESM probe. Local `npm run verify` passed (502 application tests); the narrative tarball consumer passed (24 archive files, NodeNext/Bundler and offline install); the combined scene consumer passed typecheck, unit tests, Vite and Chromium using those same archive paths; prepared offline runtime probes passed on Node 22.23.5. The exact Node 22.0.0 workflow step is configured but awaits GitHub Actions execution.
- **P4.1** — gameplay package definitions and dependency/import boundary. Added the optional `waypoint-rpg-gameplay` TypeScript ESM workspace with a versioned game-neutral definition schema, structural/JSON-safety/reference validation, defensive immutable compilation, exact root exports, and focused boundary/definition tests. Added it to existing framework build/test orchestration and prepared CI build-tool installation under Node 22.22.2. Gameplay compiled; all 8 gameplay tests passed; scoped ESLint passed; the full root `npm run verify` passed with 502 Kids RPG tests and both example builds. The commit SHA is recorded in the following P4.2 entry.
