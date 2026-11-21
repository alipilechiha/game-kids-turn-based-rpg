# Phase 3 — Narrative and Quest Engine

## Status and scope

Approved implementation plan for six local milestones, in dependency order. Phase 3 adds an optional, game-neutral narrative package and exercises it in the independent `examples/scene-demo` consumer. It does not complete a general-purpose Three.js RPG engine, renderer, combat system, or cinematic system.

The Kids RPG, `packages/core`, the Phase 2 scene-demo lifecycle, child-facing content, current save format, and offline/PWA behavior remain compatible and unchanged. The demo story is original fictional content; it is not represented as a quotation from Ferdowsi.

## Baseline findings

- `packages/core` exports generic identifiers, world primitives, graph/pathfinding, a reducer runtime, and persistence contracts. Its runtime accepts a reducer that returns state and notifies subscribers after every dispatch, including identity-preserving rejection. It does not provide a typed command result or own persistence. Phase 3 will not modify the core package.
- `examples/scene-demo` already installs `waypoint-rpg-core` from an independently built tarball and owns its scene registry, `SceneHost`, React/R3F presentation, transitions, and disposal. It has courtyard/workshop scenes and a lamp consequence, but no narrative package or story save.
- `SceneHost.start(mapId)` currently selects the map's spawn anchor. Its async generation/cancellation logic must remain authoritative. Add an optional validated entry anchor while preserving the existing default. Persist a location only after the host commits the matching load.
- The Kids RPG's dialogue, quests, reducer, save coordinator, validators, and persistence are application-specific and are not a suitable generic schema. They remain untouched.
- Baseline revision: `04abd81888096f5ad8ad99e1b75243fa3db67481` (`origin/main`, Phase 1 and Phase 2). Baseline `npm run verify` passed: format, lint (18 pre-existing warnings), core checks/build/tests (15), typecheck, application tests (474), production/PWA/budget/deploy checks, and both example builds. Baseline CI E2E and Pages workflows were green. The earlier shard-4 routine timing failure was on an older revision and is not a Phase 3 baseline failure.

## Package boundary and public API

Create optional package `waypoint-rpg-narrative` at `packages/narrative/`. It is zero-runtime-dependency TypeScript ESM, browser/Node-runtime-neutral, and independent of React, Three.js, the DOM, storage, scene-demo, and `waypoint-rpg-core`. Its source imports only its own relative `.js` modules. Consumers choose their runtime integration and persistence.

Expose only the package root. The approved public API is:

- `validateNarrative(definition)` — structured error/warning diagnostics with definition IDs and paths.
- `compileNarrative(definition)` — validates, copies, and deeply freezes JSON data into an opaque compiled definition; no mutable authoring reference or internal map escapes.
- `createNarrativeState(compiled, playthroughId)` — creates one playthrough's durable narrative snapshot.
- `transitionNarrative(compiled, state, command)` — pure atomic command transition with explicit accepted/rejected result and reason.
- `evaluateCondition`, `getDialogueView`, `getQuestStatus`, and `getFact` — deterministic pure queries.
- `decodeNarrativeState(compiled, input)` — validates compatible persisted narrative payloads without silently discarding incompatible bytes.
- Public definition, state, command, result, diagnostic, condition, effect, and query types.

The exact exported names are tested from the built package root. No deep/internal imports are supported.

## Definitions and semantics

### Version meanings

- `schemaVersion` identifies the supported structure and semantics of the definition format. Unknown values are errors.
- `contentVersion` is a stable author-controlled content revision. Copy and presentation-only edits may increment it without invalidating progress. Definition identity plus schema compatibility determine whether progress can resume; content-version mismatch alone does not.
- The scene-demo save envelope has its own application schema version. It validates scene location, playthrough identity, and the narrative payload. It is not the narrative definition schema version.
- Structurally incompatible content changes are handled explicitly by content compatibility metadata/definition identity. The demo refuses to hydrate incompatible progress, keeps the original stored bytes intact, and offers recovery/reset. Phase 3 does not add a general migration framework.

### Safe JSON and compiled immutability

Accept only bounded-depth acyclic JSON composed of plain objects, dense arrays, strings, booleans, null, and finite numbers. Reject functions, symbols, accessors, non-plain prototypes, sparse arrays, cycles, `undefined`, non-finite values, and unsafe keys (`__proto__`, `prototype`, `constructor`). Copy before freezing. Compiled lookups remain private; returned views are immutable copies/read-only projections.

### Conditions

Use typed expression data only; never `eval`, callbacks, or generated code. Support boolean facts, equality/inequality, integer ordering, persisted quest-status checks, `all`, `any`, and `not`. Missing facts evaluate as absent: flag checks and equality are false; `neq` is true only for a present fact unequal to its operand. Therefore `neq` is not equivalent to `not(eq)`. Ordered comparisons require both operands to be safe integers; no coercion, fractional, string, NaN, or infinity comparisons. Unknown operators, invalid operand types, and unsafe fact keys are validation/runtime rejections.

Authored quest-status predicates may name only persisted states `active`, `completed`, `failed`, or `cancelled`. `locked` and `available` are derived and queryable through `getQuestStatus`, but cannot be prerequisites. Detect unconditional prerequisite cycles that cannot start; report conditional/possibly cyclic dependencies as warnings when static satisfiability is undecidable. Test direct and indirect recursive availability attempts.

### Dialogue, playthrough, and quest transitions

Definitions provide stable story/dialogue/choice/quest IDs, localized strings, typed conditions/effects, optional cues, entry nodes, and terminal nodes. Cycles in dialogue are allowed. Missing targets and unreachable required entry points are errors; unreachable optional content is advisory where appropriate.

One narrative state represents one story playthrough (`playthroughId`). Applied choice/trigger IDs, narrative revision, and terminal-ending immutability are scoped to it. Triggers default to one application per playthrough; only an explicitly repeatable trigger can run again at a later revision. A command must match the state playthrough and expected revision. A successful durable command increments revision exactly once; rejected, stale, semantically inapplicable, and presentation-only commands do not. A choice's persistent effects apply once per playthrough; explicitly repeatable choices may apply again only at a later valid revision. There is no New Game+ or multi-profile system in this phase.

Commands cover dialogue open, linear advance, choice selection, permitted exit, terminal finish, and authored condition-checked triggers. Exit without an active dialogue, finish on a nonterminal node, advance on a choice-only node, unknown targets, unavailable choices, invalid transitions, and repeated/stale submissions reject without mutation or revision advance. A terminal ending cannot be replaced in that playthrough.

Effects are a closed typed set: set/clear boolean or JSON fact, integer increment/decrement with safe-integer overflow checks, and start/complete/fail/cancel quest. Evaluate the full ordered list against a private draft. Thus `start-quest` followed by `complete-quest` may be valid; any invalid operation discards the entire draft. Repeated quest completion cannot grant duplicate effects. Restart semantics are explicit in the definition; only cancelled/failed quests explicitly marked restartable may start again. Mutually exclusive outcomes are modeled with conditions and state transitions, not engine-specific moral values.

### Reducer/application integration and durable state

The core runtime's state-returning reducer cannot communicate typed rejection directly. The demo application reducer therefore owns a durable gameplay snapshot and a separate transient feedback record. For each submitted app command, it creates a unique transient correlation token, validates startup/session/dialogue/scene eligibility at the command boundary, then calls the pure narrative transition. Accepted results replace durable state and increment narrative revision; rejected results preserve durable snapshot identity and revision and update only correlated transient feedback. Tokens never enter the narrative save schema.

Subscribers can be notified on unchanged state, so persistence is driven only by an accepted reducer result/explicit durable-snapshot identity change, never by a runtime notification alone. This covers multiple rejected commands at the same revision without ambiguous UI feedback or accidental saves.

Movement, combat, and spatial arrival remain application-owned. The narrow authored trigger contract takes a known trigger ID, current committed scene/location, current durable state, and a validated trigger command; trigger conditions and effects use the same pure transaction path. No event bus and no unrestricted arbitrary-effect dispatch are introduced.

## Startup, scene location, storage, and reset

1. Construct an ineligible bootstrap shell. Disable gameplay commands and all autosave.
2. Read stored bytes and validate the envelope, definition/content compatibility, playthrough, narrative snapshot, and requested map/anchor. Do not create or save fresh state yet.
3. Start the validated map at the saved entry anchor (or default spawn for a fresh session) through `SceneHost.start(mapId, entryAnchorId?)`.
4. Hydrate the validated state and enable gameplay/persistence only after the scene host commits the corresponding load. For invalid/corrupt/incompatible data, keep original bytes, present explicit recovery, and enter a safe session-only recovery state only after that choice is committed.
5. Persist only accepted durable narrative changes and committed scene locations. A requested destination is never stored before successful scene commit.

`start(mapId)` preserves spawn behavior. An explicit anchor must exist, be walkable, and belong to the selected map. Unknown, blocked, or wrong-map anchors reject restoration; failure leaves prior stored bytes intact. Existing async load generation/cancellation prevents stale scene results from committing.

A confirmed reset cancels/invalidates pending scene loads and transitions from the old playthrough before creating the new playthrough. Stale completion handlers cannot update new location/state or persistence. If clearing storage fails, keep the new playthrough in session-only mode and disable autosave for that session; preserve the old bytes and verify later gameplay cannot overwrite them.

Use an application-owned local persistence adapter and test storage unavailable/corrupt/unsupported behavior. No storage API is imported into the narrative package or reducer.

## Demo and accessibility

Extend only the independent scene-demo with an original Persian (`fa`) branching story, DOM-based RTL presentation, dialogue choices, quest outcomes, condition-checked trigger, and persistent workshop object consequence. Keep all Persian copy in demo-owned content, not package logic. Provide two distinct endings and preserve facts across map exit/re-entry and reload.

Use a native modal dialog with idempotent React open/close synchronization. Provide an accessible name, modal semantics, focus entry and restoration after close/reload, background interaction protection, and keyboard exit only according to the narrative exit policy. Handle `cancel` explicitly; prevent native dismissal when exit is forbidden. Remove event listeners on unmount. Test RTL layout, punctuation/order, keyboard navigation, focus, and dismissal behavior in Chromium.

## Six milestones and local commits

1. **P3.1 — Schema and validation:** write this plan, add workspace package shell/types, safe JSON validation, diagnostics, compiler copy/freeze, validator/compiler tests. No demo consumer integration.
2. **P3.2 — Pure runtime:** add state/conditions/atomic effects/quests/dialogue/trigger and save-payload codec; test revisions, playthrough scope, invalid command rejection, cycles, immutability, missing facts, atomic ordering, replay, and round trips.
3. **P3.3 — Independent package gate:** add package build and library-side dependency/import-boundary enforcement before the consumer integration; pack and install tarball outside the monorepo; test ESM runtime, declarations under NodeNext and Bundler, and negative deep-imports. Zero runtime dependencies.
4. **P3.4 — 3D narrative integration:** add scene-demo authored story, application reducer/command boundary, modal UI, accessible RTL presentation, condition-checked object/trigger integration, and focused integration/Chromium tests. Install the narrative package only after P3.3 passes.
5. **P3.5 — Bootstrap, persistence, restoration, reset:** add validated startup/hydration, versioned app envelope, optional SceneHost start anchor, committed-location saves, session invalidation and reset fallback; test startup races, anchors, failed loads, cancellation/superseding, storage failure, original-byte preservation, reload, and no duplicate effects.
6. **P3.6 — Compatibility and docs:** document package/API and demo, update roadmap with implemented/proposed status, run full verification and package consumers, targeted scene lifecycle/browser tests, check the existing E2E/Pages CI jobs, and record deferred Phase 4–7 work. No push or merge.

Each milestone is staged and committed separately. Do not stage user files, generated output, `.tsbuildinfo`, GLB files, or registry work. No push, PR, or merge.

## Test matrix and acceptance criteria

### Package and pure runtime

- Package builds from a clean install and has no runtime/peer dependency, React/Three/browser/application import, or deep export.
- Validator tests valid graphs, stable unique IDs, malformed/non-JSON structures, unsafe keys, unknown operators/references, invalid numeric operands, prerequisite cycles, and precise field diagnostics. Dialogue cycles are accepted.
- Runtime tests cover deterministic conditions/effects, missing-fact semantics (`neq` vs `not(eq)`), integer-only ordering, transaction ordering/atomic rollback, quest lifecycle/restart rules, persisted-only predicates, direct/indirect availability recursion, unavailable choice rejection, repeatable-at-new-revision rules, stale/duplicate command handling, playthrough isolation, terminal immutability, and revision stability for invalid commands.
- Compiled data cannot be changed via authoring objects or exposed collections. State is immutable. JSON round trips preserve facts/quests/dialogue/choice history.
- External tarball is installed in a temporary directory outside workspace. A plain Node ESM consumer executes. TypeScript consumers pass both NodeNext and Bundler resolution. Deep imports fail. This gate completes before the demo imports the package.

### Consumer and application state

- Application command boundary denies commands before bootstrap ready, from invalidated sessions, for ineligible committed scenes, and while modal/dialogue state prohibits world interaction; direct dispatch cannot bypass disabled controls.
- Each feedback item maps to exactly one transient command correlation token; repeated rejections at one unchanged revision stay distinguishable and never persist.
- Only accepted durable changes or successful committed locations persist. Runtime no-op notifications do not trigger saves.
- Fresh initial state is never saved before existing bytes are read/validated and hydration or explicit recovery is committed.
- Reload returns to the same story branch, quest outcomes, facts, current map, and valid entry anchor without replaying choice effects.
- An incompatible/corrupt save leaves original bytes recoverable. If reset clearing fails, the replacement session is session-only with autosave disabled and subsequent play cannot overwrite those bytes.

### Scene lifecycle, browser, accessibility, and compatibility

- Default scene start still uses spawn. Explicit start accepts only existing walkable anchors on the requested map; unknown, non-walkable, and wrong-map anchors fail without changing committed location. Failed restoration preserves storage. Cancellation and superseded loads cannot update the new session.
- Story has two genuinely different branches/endings, a condition-restricted later choice, quest outcome, world object consequence, a condition-checked interaction, scene leave/return, and reload restoration.
- Modal is named and announced, prevents background interaction, applies the exit policy to native `cancel`, restores focus, cleans listeners, and supports tested Persian RTL ordering/punctuation and keyboard navigation.
- Kids RPG domain/content/reducer/save bytes and PWA/offline guarantees are unchanged. Phase 1 core public API and Phase 2 scene lifecycle behavior remain green.
- Distinguish **offline package installation** (runtime tarballs installed from local files; no network needed), **development-tool installation** (npm dev dependencies may require registry access), **Node runtime compatibility** (package ESM behavior under declared supported Node versions), and **browser compatibility** (DOM/R3F only in the demo, tested in Chromium). The narrative package has no Node runtime APIs; root repo engine remains Node `>=22.22.2 <23`, npm `>=10 <11`. Report package runtime support separately from build-time Node and root engine. CI claims only versions actually configured and run.
- Run `npm run verify`, `npm run framework:consumer`, narrative tarball consumer checks, `npm run framework:scene-consumer`, and relevant scene-demo Chromium tests. Use existing E2E workflow for full shards; do not duplicate full CI workflows. Classify unrelated baseline failures without skipping them.

## File-level implementation map

- `packages/narrative/package.json`, `tsconfig*.json`, `src/*.ts`, `test/*.test.mjs`, `scripts/check-boundary.mjs` — package, API, compiler, validator, runtime, and tests.
- root `package.json` / lockfile — workspace and explicit build/test orchestration with non-repeated compilation where possible; each individual script remains usable after clean install.
- `scripts/check-framework-narrative-consumer.mjs` and a temporary consumer fixture — independent tarball, NodeNext/Bundler, runtime, and deep-import gate.
- `examples/scene-demo/src/content/*`, app state/adapter, `App.tsx`, `scene-host.ts`, persistence adapter, and tests — game-owned story integration, committed location/start anchor, bootstrap/reset, accessible DOM modal.
- `examples/scene-demo/e2e/*` or existing Chromium smoke test — reload/scene/modal behavior.
- `docs/FRAMEWORK-ROADMAP.md`, `docs/framework-api.md`, `packages/narrative/README.md`, and `examples/scene-demo/README.md` — final API and roadmap status.
- `.github/workflows/e2e.yml` — only focused package/consumer checks or use the existing package workflow; no duplicated full E2E workflow.

## Deferred work and known limitations

Phase 4+ may explore reusable renderer packaging after another consumer proves the seam. Combat, cinematic direction, generalized event buses, multi-profile/New Game+, arbitrary script hooks, broad save migrations, child-game migration, authoring tools, and additional renderers are deferred. Phase 3 validates one compact demo and a neutral engine; it does not claim universal narrative design or all browser/device support.
