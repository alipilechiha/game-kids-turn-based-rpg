# Garden of Stories Post-Merge Hardening Plan

## 1. Objective

Correct the focused regressions and missing verification around the merged Garden of Stories sample, using the current `main` branch as the implementation baseline. Preserve the Kids RPG, Garden's existing story paths and saves, the three reusable package boundaries, and the current Blood Leaf and scene-demo behavior.

This plan covers the eight requested corrections in priority order:

1. Repair the gameplay native-runtime snapshot smoke invocation and verify Node 22.0.0.
2. Require explicit confirmation before replacing a valid Garden save with a new playthrough.
3. Autosave only a new durable snapshot after a usable scene has committed.
4. Bring Blood Leaf screenshot capture in line with the current workshop-clue dialogue and lantern story flow.
5. Add a dedicated Garden independent-consumer/gameplay-E2E CI check and make its status required.
6. Verify dialogue focus containment, keyboard navigation, and background inertness.
7. Synchronize committed waypoint arrivals with the rendered player's actual arrival.
8. Reconcile Phase 5 roadmap status with its merged work and recorded acceptance evidence.

No application code, tests, or commits were created while preparing this plan.

## 2. Current Repository State

- The inspected `origin/main` is `1ae9946bd280caa6847e78d6a9b32180a3499ad8`, the PR #119 merge. Re-fetch `main` immediately before implementation; the planning worktree is on the already-merged Garden branch at `1d000dc39c5eb0da829589402ef26c657df8f3bc` and is clean, but is behind current `main`.
- Garden landed in PR #117 (merge `70b04362a717f806891f8a333031cf6ed584a63a`). Phase 5 work landed in PR #118 (merge `56dbb6a2ce1413cd7c027254b2dd02fd2c33f21b`). PR #119 is the latest inspected merge.
- The PR #117 and PR #119 `framework-consumer` job logs both reach Node 22.0.0 and fail at `packages/gameplay/runtime-smoke.mjs:69`: the smoke passes only the state to `encodeGameplayState`, whose current public signature requires `(compiled, state)`. The observed error is `Expected a CompiledGameplay created by compileGameplay().` This is an invocation defect in the probe, not evidence of a package runtime incompatibility.
- The latest inspected PR #119 checks also show E2E shards 1 and 3 failing at `e2e/gltf.spec.ts:66` because the observed GLB request set contains 11 more files than the test's committed-asset expectation; shards 2 and 4 passed. Treat this as an existing Kids RPG baseline result, separately classify it against the clean current-main run, and do not change its expectations as part of this Garden correction unless a targeted change demonstrably causes it.
- Screenshot capture was cancelled in the inspected PR #117, #118, and #119 checks. `.github/workflows/sample-previews.yml` uses the shared `sample-game-previews` concurrency group with `cancel-in-progress: true`; a cancelled preview job is not a successful capture result.
- `.github/workflows/e2e.yml` has a core/narrative/gameplay consumer job and four Kids RPG shards, but no distinct Garden status check. `scripts/check-framework-garden-consumer.mjs` already packs and installs all three archives in an isolated copy, checks public ESM/types and source boundaries, builds the sample, and runs `npm run test:e2e` from that installed consumer. Reuse this gate.
- Garden's title screen exposes Continue and Start for a valid save. Start currently calls `startFresh('persistent')` immediately. The in-game New Game path already opens a reset confirmation panel, so the missing guard is specifically the title-screen replacement path.
- Garden's autosave subscriber runs after every core runtime notification and writes whenever the resulting state is playing and not walking. `rendererReady` only records `Canvas.onCreated`; it does not confirm the selected map, camera, validated anchor, and a rendered frame have committed together.
- `GardenScene.tsx` schedules `ARRIVE` after 190 ms. `PlayerCharacter` independently interpolates from the committed previous anchor to the current anchor for 180 ms. The reducer validates the route and expected anchor, but the timer is not synchronized with actual rendered movement completion.
- Garden dialogue is a `<section role="dialog" aria-modal="true">` inside the game shell. Choice buttons use `autoFocus`, but the current Garden E2E suite does not assert Tab/Shift+Tab containment, background inertness, or opener focus restoration.
- `examples/scene-demo/scripts/capture-previews.mjs` still follows the older sequence `dialogue-open → seek-truth → leave → transition → lantern-interaction`. Current Blood Leaf exposes `clue-interaction` in the workshop, the `workshop-clue-dialogue`, and the `investigate-clue` choice. That choice applies `lantern-lit` and `clue-resolved`; a direct lantern click no longer demonstrates the authored path.
- The canonical roadmap marks Phase 5 `Next`, and README is generated from that table. The Phase 5 plan records P5.0 and P5.1 implementation/evidence only; it explicitly leaves P5.2–P5.4, source-rendered gallery captures, live mixer context recovery, animation playback, and timeline acceptance incomplete. The merged PR is not evidence that Phase 5 passed all five gates.

### Baseline collection before implementation

On a fresh worktree from the refreshed `origin/main`, record results for `npm run verify`, `npm run framework:consumer`, `npm run framework:narrative-consumer`, `npm run framework:scene-consumer`, and the gameplay package check/build/prepared-test commands. Also run the existing Garden consumer and preview workflows before editing when the current environment permits. Separate current-main failures from corrections introduced by this work; do not infer a clean baseline from PR merge status.

## 3. Confirmed Existing Architecture

The Garden application composes `waypoint-rpg-core`, `waypoint-rpg-narrative`, and `waypoint-rpg-gameplay` through its application-owned runtime in `examples/garden-adventure/src/game/runtime.ts`. Package snapshots remain the authoritative quest and gameplay state; the renderer projects these facts and gameplay positions into Three.js. The save adapter is `examples/garden-adventure/src/persistence/garden-save.ts`, and the isolated package consumer is owned by `scripts/check-framework-garden-consumer.mjs`.

The reusable libraries must remain game-agnostic. This correction should not change their runtime contracts, package dependency direction, Garden save schema, or Kids RPG save semantics. The only package-area change in scope is the argument correction in the gameplay package's native ESM smoke script.

The screenshot automation is already in the shared merge-triggered preview workflow. The Garden consumer gate is already stronger than a type-only check; the missing CI work is an independently visible job/status that cannot be hidden inside the screenshot workflow's cancellable job.

## 4. Requirements and Scope

### In scope

- Fix the `encodeGameplayState(compiledGameplay, gameplayState)` invocation in the package runtime smoke and run that installed-tarball probe on exactly Node 22.0.0.
- Protect a valid existing save on the title screen until the player accepts a clearly worded replacement confirmation. Cancellation must preserve the exact stored bytes and allow Continue.
- Gate autosaves on all of: a changed durable snapshot; no in-flight walk; a confirmed active, usable scene matching the committed map/anchor; and successful persistence mode. Keep storage access in the application adapter.
- Repair Blood Leaf source-rendered preview steps to follow its current dialogue, workshop, clue, and lantern consequence through actual UI interaction.
- Add a dedicated Garden validation job to the existing E2E workflow. Reuse the isolated three-tarball script and its full Garden E2E run. Configure the stable job check as required in repository branch protection/rulesets, if available to the authorized implementer.
- Test dialogue initial focus, Tab and Shift+Tab wrapping, Escape/close behavior, focus return, and that world/background controls cannot receive focus or activation while the modal is open.
- Replace the unrelated fixed arrival timer with a verifiable synchronization contract between the rendered waypoint and the reducer's validated `ARRIVE` command, or document evidence for a safe equivalent. The default plan is renderer completion signaling followed by the existing reducer validation.
- Reconcile Phase 5 status without claiming completion unless P5.0–P5.4 acceptance gates have evidence. Regenerate the README roadmap from the canonical table.

### Out of scope

- New reusable renderer, navigation, persistence, focus-management, or gameplay packages.
- Garden narrative or save-schema redesign; edits to legacy Kids RPG game behavior or saved data.
- Rewriting Blood Leaf narrative content or package APIs to fit the stale screenshot script.
- Claiming Phase 5 complete based on merge alone.
- Broad cleanup of the independently failing Kids RPG GLB request-set test unless a corrected baseline run establishes the failure as part of this task.
- Push, PR creation, merge, release, or deployment.

## 5. Decisions and Assumptions

- Implementation starts in a new isolated `codex/garden-post-merge-hardening` worktree based on the latest fetched `origin/main`, not by continuing on the merged PR #117 branch.
- Use existing React, R3F, Three.js, Playwright, and package-consumer tooling. Do not add runtime dependencies.
- Preserve Garden's versioned save envelope and `waypoint-rpg:garden-adventure:save` namespace.
- Treat invalid, unsupported, and unavailable saves conservatively: keep original bytes, use the existing temporary/session-only recovery route, and do not silently overwrite them.
- Use native `<dialog>.showModal()` for Garden modal presentation if compatible with the existing backdrop and RTL styling. This gives browser-managed focus containment and background inertness without a new dependency. Route `cancel`/Escape through one state transition and explicitly restore focus to the original opener if the opener remains available. If a native dialog cannot meet the existing child-friendly outside-tap behavior, use a small sample-owned focus/inert implementation with the same observable tests.
- Treat a rendered arrival signal as a request to the application reducer, not authority to mutate gameplay state. Keep `ARRIVE` route/anchor validation in `runtime.ts` and reject stale callbacks there.
- Phase 5 remains `In progress`: P5.0 and P5.1 have recorded work, while the plan's P5.2–P5.4 gates are still unrecorded. Phase 4 remains Complete unless baseline acceptance evidence contradicts its canonical gates.
- The GitHub required-check setting is repository configuration, not a workflow YAML field. A workflow job can be added locally, but an authorized repository maintainer must ensure its exact check name is selected in branch protection/rulesets.

## 6. Proposed Technical Design

### Runtime smoke and minimum Node floor

Change the gameplay round-trip probe to call `encodeGameplayState(definition, granted.state)` and decode with the same compiled definition. Preserve the probe's installed-tarball isolation. CI prepares the package archives and toolchain using the repository's supported build Node, then runs the runtime-only probe separately under Node 22.0.0. `npm run framework:consumer` alone does not run this minimum-runtime probe.

### Safe new game and autosave gate

Route the title-screen Start action through the same explicit replacement-confirmation intent used for New Game. Confirmation may remove/replace the save only after the player accepts; cancellation leaves both the in-memory session and `localStorage` bytes unchanged. Keep the temporary-session option for corrupt/unsupported storage.

Centralize the autosave eligibility check in the Garden application layer. Compute a deterministic fingerprint from the persisted envelope fields (map, anchor, encoded narrative state, encoded gameplay state, compatibility/playthrough metadata). Do not write if the fingerprint equals the last successfully written fingerprint. Do not mark a fingerprint saved until `writeGardenSave` succeeds.

Have the active Garden scene report readiness only after its registered scene, current map, validated committed anchor, active camera, and at least one real render frame agree. Invalidate that readiness on scene replacement, context loss, or mismatch. Autosave only when the current durable snapshot is new, `walk` is null, persistence is enabled, and the readiness report matches the current committed map/anchor. Keep manual Save behavior available and ensure it follows the same usable-scene safety check or reports a gentle unavailable status.

### Dialogue modality

Convert the dialogue panel (and reset/ending panels where shared lifecycle requires it) into a modal native dialog shown with `showModal()`. Preserve the sample-owned text, buttons, `data-testid` selectors where practical, Escape semantics, backdrop dismissal, and focus return. Avoid a second global Escape handler dispatching a duplicate exit. Let the browser's modal top layer make the underlying scene, navigation, header, and save controls inert.

### Movement and rendered arrival

Move the player's presentation toward `state.walk.path[state.walk.nextIndex]` while the reducer still holds the last committed anchor. The scene probe must observe the player at the destination across consecutive frames, with a render between observations, before asking the runtime to dispatch one `ARRIVE` command. The reducer and an app-owned freshness check validate the current map, playthrough, committed anchor, route ID, next index, and destination. Duplicate frames and callbacks queued before reset or scene replacement must be harmless. Remove the independent 190 ms timeout. Cover normal and reduced motion, multiple waypoints, stale callbacks, and arrival-report evidence in Chromium without arbitrary sleeps.

### Blood Leaf screenshot flow

Keep the current three preview names unless the existing gallery contract requires otherwise. After the title/courtyard and initial dialogue captures, use the current authored `seek-truth` route, leave only where allowed, transition to the workshop, activate `clue-interaction`, advance to the clue question, and select `dialogue-choice-investigate-clue`. Wait for `clue-status[data-resolved="true"]` and `window.__sceneProbe.lampLit === true` before taking the lit-lantern capture. Verify that the quest/fact and world light changed through the application path; do not click a direct legacy `lantern-interaction` to manufacture the visual result.

### CI and roadmap

Add a stable Garden job to `.github/workflows/e2e.yml` that installs the locked Node 22.22.2 development environment and Chromium dependencies, then runs `npm run framework:garden-consumer`. That existing script installs the three packed archives into an isolated sample copy and runs the Garden tests, production build, and Chromium E2E suite there. Upload Playwright reports/traces on failure. Document the required check name and verify the repository ruleset requires it; do not clone a second preview workflow.

Update the canonical Phase 5 row from `Next` to `In progress`, add PR #118 as implementation evidence, and state explicitly that P5.2–P5.4 remain open. Add a concise post-merge audit note to `.plans/phase-5-model-animation-cinematics.md` so its execution record and roadmap agree. Keep Phase 6 and Phase 7 Planned. Run `npm run roadmap:sync` to regenerate only the README's generated roadmap block.

## 7. API and Data Contracts

- Current gameplay package API: `encodeGameplayState(compiled: CompiledGameplay, state: GameplayState): string`; `decodeGameplayState(compiled, serialized)` must use that same compiled definition. No package API change is planned.
- Garden save snapshot remains application-owned and versioned: `mapId`, `anchorId`, narrative snapshot, gameplay snapshot, shared playthrough identity, and existing compatibility metadata. Derived selectors and render resources are not serialized.
- Garden remains the only writer of its `localStorage` namespace. Reducers and the three reusable package runtimes remain free of browser storage access.
- Movement commit remains `ARRIVE { routeId, anchorId }`. The reducer's current expected-route and next-anchor checks stay authoritative; the renderer reports a completed presentation movement but cannot commit state directly.
- Scene readiness is transient application/presentation coordination data, not durable game progress. It must include enough identity to reject late callbacks from an old map/scene generation.
- CI uses only public package-root imports in the copied consumer; no workspace-source symlinks or package deep imports are introduced.

Dependency direction:

```text
Garden app coordinator
  ├── waypoint-rpg-core (authoritative runtime; validated ARRIVE command)
  ├── waypoint-rpg-narrative (story state and authored consequences)
  ├── waypoint-rpg-gameplay (progression and encounter state)
  ├── Garden renderer (scene readiness + rendered waypoint completion signal)
  ├── Garden persistence adapter (durable fingerprint + versioned save)
  └── Playwright consumer gate (three installed archives + production Chromium E2E)
```

## 8. Implementation Milestones

### H0 — Refresh main and capture baseline

Create a clean worktree from latest `origin/main`, record the SHA and exact current CI status, and run the pre-change checks available in the execution environment. Keep unrelated existing failures in a baseline list.

### H1 — Fix native gameplay smoke (priority 1)

Correct the encode call in `packages/gameplay/runtime-smoke.mjs`. Pack the three compiled archives, prepare the isolated consumer with `node scripts/check-framework-runtime.mjs --prepare ...`, then run `node scripts/check-framework-runtime.mjs --probe ...` under exactly Node 22.0.0, matching `.github/workflows/e2e.yml`. Verify both encode and decode complete. Commit this package-test-only change separately.

### H2 — Protect saved progress (priority 2)

Update the Garden title Start path, confirmation copy and persistence E2E coverage. Prove exact save-byte preservation on opening/cancelling confirmation and replacement only after explicit acceptance. Commit the scoped UI/test change.

### H3 — Gate autosave on durable commit and usable scene (priority 3)

Add a durable snapshot fingerprint and a scene readiness handshake. Cover startup before first scene commit, repeated no-op notifications, route completion, map transition, renderer/context recovery, and storage exceptions. Commit the app/persistence tests separately from unrelated work.

### H4 — Repair Blood Leaf screenshot path (priority 4)

Update `examples/scene-demo/scripts/capture-previews.mjs` to drive the authored workshop clue and await the actual lantern fact/rendered state. Run the production-build preview capture and validate all expected PNGs and provenance.

### H5 — Add dedicated Garden CI gate (priority 5)

Add a non-cancellable, stable Garden job to `.github/workflows/e2e.yml` that runs the isolated three-tarball consumer and its complete Playwright gameplay suite. Confirm the exact job check is marked required in repository rules; record if repository settings are unavailable to the implementer.

### H6 — Add dialogue modality regression tests (priority 6)

Implement accessible modal focus/inert behavior and Playwright assertions for initial focus, Tab wrapping, Shift+Tab wrapping, Escape/close once, opener focus restoration, and background inertness. Preserve accessible backdrop dismissal and Persian RTL.

### H7 — Synchronize committed arrival and rendered motion (priority 7)

Replace the 190 ms timeout with a completion signal driven by the rendered player interpolation, retain reducer route/anchor validation, and test normal, reduced-motion, stale-route, multi-waypoint, and scene-unmount cases.

### H8 — Reconcile Phase 5 and generated roadmap (priority 8)

Update the canonical roadmap and Phase 5 execution record to mark Phase 5 In progress, keep incomplete gates open, cite PR #118 as partial implementation evidence, then regenerate and check the README roadmap.

### H9 — Final verification and scoped commits

Run the final applicable verification matrix on the completed branch, inspect diffs against the refreshed main, check protected Kids RPG files/save formats, commit only task-scoped changes in small commits, and leave the branch local. Do not push, open a PR, or merge.

## 9. Dependencies and Execution Order

1. H0 must precede all implementation so later results can be compared with current-main CI.
2. H1 is independent and should land first to unblock Node 22.0.0 package-runtime evidence.
3. H2 precedes H3 because both touch persistence and autosave observation; tests must distinguish explicit replacement from automatic writes.
4. H3 precedes H7 if the scene-ready callback/probe is shared; implement one identity-aware scene lifecycle signal and reuse it for autosave and movement assertions.
5. H4 can proceed independently after current-main flow inspection; its capture must run against the committed runtime code and report source SHA.
6. H5 reuses the existing `framework:garden-consumer` script and should follow the smoke/test changes it will enforce.
7. H6 and H7 are independent after H3's scene handshake is stable.
8. H8 follows the verification evidence for this work and the recorded Phase 5 gate audit; README generation follows canonical roadmap edit.
9. H9 runs after every implementation change. Captures must be generated from committed runtime source; generated preview/documentation artifacts can be committed in a separate scoped commit.

## 10. Edge Cases and Error Handling

- **Valid save + Start:** do not dispatch `NEW_GAME`, clear storage, or autosave a replacement until confirmation. On cancel, the current title and original bytes remain usable.
- **In-game New Game:** continue to require explicit confirmation; double clicks cannot perform two resets.
- **Corrupt/unsupported save:** temporary play remains session-only; the incompatible bytes remain untouched until the existing explicit clear/reset action.
- **Storage unavailable/quota failure:** retain the in-memory session, switch to current session-only behavior, and never report a successful persistent save.
- **No-op runtime notification:** equal durable fingerprint means no storage write and no success feedback.
- **Scene not usable:** do not persist the new map/anchor until the active scene, camera, validated anchor, and first rendered frame match the committed state.
- **Map transition/context loss:** invalidate scene readiness and wait for the new/restored scene before autosaving a different durable map snapshot.
- **Stale render callbacks:** scene generation, route ID, and anchor checks prevent late ARRIVE requests from changing a reset or new route.
- **Background tab / demand render:** movement cannot commit just because wall-clock time elapsed; the render completion signal resumes when a real frame reaches the destination. Reduced motion completes on the first active frame.
- **Dialogue close paths:** Escape, explicit close, and backdrop click dispatch at most one exit. A disabled choice cannot receive focus or activate; focus returns to the opener when still mounted.
- **Capture failure:** fail on missing/empty/tiny PNGs, wrong dialogue state, unresolved clue, unlit lantern, page errors, or wrong source provenance. Do not accept old screenshots as proof.
- **CI cancellation:** Garden's required job must not share the screenshot workflow's cancel-in-progress group. Screenshot capture cancellation remains a separate non-success and must be rerun to completion.

## 11. Testing and Verification

| Area                        | Planned checks                                                                                                                                                                                                                                 | Evidence required                                                                                                                                                                     |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline                    | `npm run verify`; `npm run framework:consumer`; `npm run framework:narrative-consumer`; `npm run framework:scene-consumer`; `npm run framework:gameplay:check`; `npm run framework:gameplay:build`; `npm run framework:gameplay:test:prepared` | Exact command outputs and current-main failures recorded before edits                                                                                                                 |
| Node minimum                | Pack the three archives, run `scripts/check-framework-runtime.mjs --prepare`, then run `scripts/check-framework-runtime.mjs --probe` under exactly Node 22.0.0; `npm run framework:consumer` alone does not execute the floor probe            | Native ESM snapshot encode/decode passes without build tools on the minimum runtime                                                                                                   |
| Save confirmation           | Garden persistence Playwright tests                                                                                                                                                                                                            | Save bytes stay identical before confirmation and after cancel; new playthrough replaces only after confirmation                                                                      |
| Autosave                    | Garden unit and Playwright persistence/world tests                                                                                                                                                                                             | No writes for duplicate notifications; no write before scene readiness; one write for changed committed snapshot; state/map/facts survive reload                                      |
| Narrative/accessibility     | Garden dialogue Playwright suite                                                                                                                                                                                                               | Initial choice focus; Tab and Shift+Tab wrap; page background inert; Escape/backdrop closes once; focus restoration; keyboard-only choice works                                       |
| Arrival sync                | Garden scene unit/E2E tests                                                                                                                                                                                                                    | Rendered player reaches anchor before reducer commits ARRIVE; next route step starts from committed anchor; stale callbacks rejected; reduced motion remains immediate and meaningful |
| Garden independent consumer | `npm run framework:garden-consumer`                                                                                                                                                                                                            | Each archive independently installs offline; public roots and declarations resolve; copied Garden production build and full Garden Playwright suite pass against installed tarballs   |
| Blood Leaf preview          | `npm run sample:scene:previews`                                                                                                                                                                                                                | Three actual Chromium captures; workshop clue reaches resolved fact; scene probe confirms lantern lit; PNG signature/dimensions/hash and provenance valid                             |
| Garden preview              | `npm run sample:garden:previews`                                                                                                                                                                                                               | Existing Garden preview suite still captures valid production-rendered states                                                                                                         |
| Workflow                    | Dedicated Garden CI job on a review branch                                                                                                                                                                                                     | Stable job is visible and not grouped under cancellable preview workflow; failure artifacts are uploaded                                                                              |
| Roadmap                     | `npm run roadmap:check` and `npm run roadmap:sync`                                                                                                                                                                                             | Canonical phase status and generated README agree; no unrelated phase status changed                                                                                                  |
| Compatibility               | `npm run verify`, all applicable package consumers/tests, and focused Kids RPG GLB/E2E tests                                                                                                                                                   | Existing Kids RPG save contract and reference behavior preserved; pre-existing `gltf.spec.ts` baseline classified separately                                                          |

Do not use fixed sleeps for scene readiness or arrival assertions. Prefer Playwright polling on explicit scene/probe state and package-backed save snapshots.

## 12. Risks and Recovery Strategies

- **Remote-main drift:** implementation branch starts from a stale Garden branch. Refresh and record `origin/main` before creating the worktree; if main advances during execution, rebase/merge only in the task branch and rerun affected checks.
- **Native dialog behavior differs from current overlay:** test Escape, backdrop dismissal, focus placement and scroll behavior in Chromium at both mobile and desktop sizes. Keep a small sample-owned fallback if browser behavior cannot preserve existing UX.
- **Autosave and scene readiness race:** make readiness generation-scoped and compare it against the state being serialized. On mismatch, defer save instead of guessing.
- **Arrival callback does not fire under demand rendering:** ensure the animation invalidates frames only until it settles; reduced-motion path requests an initial frame; test context restore and hidden-tab resume. Never leave an always-running render loop.
- **Consumer gate runtime and tooling versions differ:** keep toolchain install at supported Node 22.22.2 and run only native package runtime smoke at Node 22.0.0. Do not run root Vite/TypeScript commands at the package runtime floor.
- **Required-check settings unavailable:** workflow code alone does not enforce branch protection. Report the exact check name and leave a clear repository-settings action; do not claim the gate is required until a ruleset confirms it.
- **Phase 5 evidence gap:** keep P5 incomplete if P5.2–P5.4 are still unverified. A roadmap status edit must not erase the unimplemented acceptance gates.
- **Screenshot concurrency:** if a newer `sample-previews` workflow cancels capture, rerun via `workflow_dispatch` or after the group is idle; report canceled runs separately, not as capture passes.
- **Unrelated Kids RPG E2E failures:** preserve the baseline logs and avoid broad expectation changes. If a new regression appears, compare it against the recorded current-main run before touching protected application behavior.

## 13. Acceptance Criteria

- The gameplay runtime smoke correctly encodes and decodes an installed archive state on Node 22.0.0.
- Existing Garden save bytes cannot be replaced by title Start or New Game without an explicit accepted confirmation; cancel leaves bytes unchanged.
- Autosave occurs only when the durable snapshot changed and a usable matching scene is committed; rejected/no-op notifications do not write.
- Blood Leaf previews use the actual workshop clue dialogue and `investigate-clue` narrative consequence; the final lantern capture proves the scene fact is lit.
- A dedicated Garden CI job runs the isolated three-tarball consumer and its full E2E suite; its exact check is required by repository rules or the remaining settings action is explicitly reported.
- Dialogue focus is contained, keyboard navigation wraps, background is inert, and close returns focus without duplicate state changes.
- The reducer's ARRIVE commit follows completed rendered movement; duplicate/stale callbacks do not advance the route.
- Phase 5 is marked In progress and is not marked Complete until the five gates in `.plans/phase-5-model-animation-cinematics.md` have all been verified. README is regenerated from the canonical roadmap.
- Final verification reports the current-main baseline separately from task regressions; Kids RPG save format and gameplay semantics are unchanged.
- Scoped local commits are complete; nothing is pushed, merged, or opened as a PR.

## 14. Rollout and Compatibility

All changes are additive or targeted to sample/test tooling. The public core, narrative, and gameplay package APIs remain unchanged. Garden save envelope/version and key remain compatible. The Kids RPG continues to own its current domain, persistence, and rendering rules.

Merge-triggered screenshots remain handled by `.github/workflows/sample-previews.yml`; the new Garden required job belongs in the existing `.github/workflows/e2e.yml`. The preview workflow continues to upload screenshots and propose a documentation PR rather than pushing generated images to protected `main`.

The only roadmap status change planned is Phase 5 from `Next` to `In progress`, backed by PR #118 and its recorded partial P5.0/P5.1 evidence. Do not promote Phase 5 to Complete in this correction. Generated README changes must come from `npm run roadmap:sync`.

## 15. Implementation Handoff

1. Read repository `AGENTS.md` and the referenced dialogue, scene-lifecycle, and Phase 5 acceptance docs from the fresh `main` worktree.
2. Confirm latest `origin/main` and baseline CI; record exact failures before edits.
3. Implement H1 through H8 in priority order. Keep each commit scoped, local, and reviewable.
4. Run the focused tests after each milestone and the full verification matrix at H9. Do not hide failures or treat cancelled screenshot runs as passing.
5. Generate Blood Leaf and Garden screenshots from production-built browser states after runtime changes are committed; validate each artifact and source SHA.
6. Verify the required GitHub check configuration and roadmap generation. If ruleset access is unavailable, report the exact status-check name and remaining external action.
7. Review the final diff against current `main`, confirm no Kids RPG save/schema/domain semantics changed, then leave all task commits local without pushing, opening a PR, or merging.

Suggested local commit groups:

- `fix(gameplay): correct minimum-runtime snapshot smoke`
- `fix(garden): protect saved progress and gate autosaves`
- `fix(garden): synchronize modal and waypoint lifecycle`
- `test(samples): repair Blood Leaf capture and require Garden consumer`
- `docs(roadmap): record Phase 5 partial acceptance`

## 16. Execution record — 2026-11-23

### Baseline

- The isolated hardening worktree started from current `origin/main`,
  `1ae9946bd280caa6847e78d6a9b32180a3499ad8`.
- The inspected PR #119 CI run had a framework-consumer failure from the wrong
  `encodeGameplayState` call, Kids RPG E2E shards 1 and 3 failing in
  `gltf.spec.ts` because 11 extra GLBs were present, shards 2 and 4 passing,
  and the preview run cancelled. Before roadmap regeneration, local
  `npm run verify` stopped at the stale generated README roadmap.
- Repository ruleset listing returned no rulesets; the branch-protection API
  returned 403 for this integration. The workflow check exists, but its
  required status cannot be confirmed from this session.

### H1–H8 implementation

- H1: corrected the native smoke snapshot encoding call. Installed package
  tarballs passed the runtime probe on Node 22.0.0 and Node 22.23.5. Commit
  `e046b16`.
- H2: title Start and New Game now confirm save replacement; cancellation
  preserves the saved bytes. Commit `ea5dcc2`.
- H3: autosave keys off a changed durable snapshot and a matching rendered
  scene/anchor; no-op notifications do not write. Focused Garden persistence
  E2E passed. Commits `2640e58` and formatter follow-up `73d72d1`.
- H4: Blood Leaf screenshot automation now follows the workshop clue dialogue
  and verified lantern fact. `npm run sample:scene:previews` passed and
  captured the actual courtyard, dialogue, and lit-lantern browser states.
  Commits `89c021f` and `68d4b1b`.
- H5: added the standalone `Garden independent consumer and gameplay E2E` CI
  job and failure diagnostics. Commit `307e525`. Required branch-protection
  status remains externally unverifiable.
- H6: native modal focus containment, keyboard wrapping, background inertness,
  Escape/outside dismissal, and opener restoration pass both accessibility
  E2E tests. Commits `36c652b` and lint/type follow-up `0e3d2b9`.
- H7: removed the 190 ms arrival timer. The player animates to the next
  waypoint while the reducer retains its previous anchor. A scene probe must
  observe the destination on consecutive frames, with a render between them;
  an app-owned freshness check then issues `ARRIVE`, and the reducer validates
  route/anchor again. Unit coverage rejects duplicate, post-reset, and
  post-map-transition callbacks; Chromium covers a three-waypoint route,
  reduced motion, scene transitions, and context recovery. Commit `3e046cc`.
- H8: Phase 5 is **In progress**, with PR #118 evidence; P5.2–P5.4 remain open.
  Phase 6/7 stay Planned. The README was regenerated from the canonical
  roadmap. Commit `6ad329b`.

### H9 verification and artifacts

- `npm run verify`: passed. This included formatting, roadmap sync, lint,
  8 model-import tests, core (15), narrative (34), gameplay (29), 550 root
  tests, package boundaries/builds, typecheck, content/assets/deploy checks,
  and hello-world/scene-demo builds. Draft-content and placeholder-asset
  warnings remain existing release-policy warnings; there were no errors.
- `npm run framework:consumer`, `npm run framework:narrative-consumer`, and
  `npm run framework:scene-consumer`: passed. The scene gate included
  Chromium narrative, lifecycle, and model smoke.
- `npm run framework:garden-consumer`: passed with three separately installed
  offline tarballs, ESM/declaration probes, copied sample build/tests, and
  Chromium smoke. Direct Garden unit tests passed 23/23; direct production
  Playwright gameplay E2E passed 19/19.
- `npm run sample:garden:previews`: passed; all 12 source-rendered screenshots
  and provenance validate under `docs/previews/garden-adventure/`. The capture
  source SHA is `0e3d2b9eca45d0a00eca64874863949f0795b4a2`.
- `npm run sample:scene:previews`: passed. Blood Leaf screenshots remain
  validated under `docs/previews/blood-leaf/`; provenance identifies source
  `2640e58a8c2da6f32640235a8cd1afead8507f64`, the unchanged scene runtime used
  for capture.
- `npm run roadmap:check`: passed after `npm run roadmap:sync`.
- The full Kids RPG Playwright sharded suite was not rerun locally. Its PR #119
  baseline failures are recorded above; this change does not touch Kids RPG
  domain, save schema, or gameplay behavior.

All task commits are local. No push, PR, or merge was performed.
