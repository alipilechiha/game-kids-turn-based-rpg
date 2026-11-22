# باغ قصه‌ها — Garden of Stories

## Objective

Add a small, complete Persian 3D RPG sample at `examples/garden-adventure/` that proves a new game can consume the published `waypoint-rpg-core` and `waypoint-rpg-narrative` archives. Players explore a village and garden, choose one of two quests, see a different persistent 3D outcome, and finish a short story. Keep the root Kids RPG and both framework packages free of Garden content.

## Current repository state

- Feature branch `codex/garden-adventure-sample` starts from the verified remote main commit `db66865827f78db4c97a4347711e314e47c984d9`, after PRs #113, #114, and #115 were merged.
- `examples/scene-demo/` already demonstrates the core and narrative root exports, standalone React Three Fiber rendering, navigation, cancellable scene transitions, persistence, story save/load, software-WebGL smoke, and an isolated tarball install.
- The root README roadmap is generated from `docs/FRAMEWORK-ROADMAP.md`. The existing `sample-previews.yml` workflow captures legacy game states and creates a reviewable README gallery PR from branch `automation/legacy-sample-previews`.
- Core and narrative packages export only their package root. Their `exports` map provides ESM JavaScript and TypeScript declarations.
- `npm ci` completed in the feature worktree with Node.js 22.23.5 and npm 10.9.9. The first baseline `npm run verify` stops at `format:check` because the merged `scripts/sync-sample-gallery.mjs` is not Prettier-formatted. This is a verified pre-existing main-branch issue. Finish the shared gallery integration in S6 with that generator correctly formatted, then run the full verification without skipping stages.

## Architecture and dependency flow

```text
Pointer / keyboard / touch
        ↓ validated sample-owned commands
Garden reducer ← createGameRuntime ← waypoint-rpg-core
        ↓ narrative command with playthrough ID and expected revision
transitionNarrative ← authored Garden definition ← waypoint-rpg-narrative
        ↓ committed narrative facts, quest status, map and anchor
Persian DOM HUD + registered Three.js scenes
        ↑ committed durable state
Garden save coordinator → versioned, Garden-only localStorage key
```

The runtime store is the sole owner of committed application state. The narrative package owns dialogue and quest transitions. Garden owns proximity and interaction checks, map registration, path animation and arrival commits, rendering, copy, and browser storage. Rendering reads narrative facts and never changes them. Store commands reject stale routes, wrong-map targets, distant interactions, invalid narrative revisions, and duplicate one-time triggers.

## File map

- `examples/garden-adventure/package.json`, `package-lock.json`, `index.html`, `tsconfig.json`, `vite.config.ts`, and `playwright.config.ts` define the separately installable web application and its scripts.
- `examples/garden-adventure/src/main.tsx`, `App.tsx`, and `style.css` own Persian RTL screens, accessibility, responsive layout, browser lifecycle, and the R3F canvas.
- `examples/garden-adventure/src/game/runtime.ts`, `commands.ts`, and `state.ts` compose the generic core runtime with sample-owned state and guarded gameplay commands.
- `examples/garden-adventure/src/content/fa/story.ts` owns the definition and Persian dialogue. `content/narrative.ts` compiles it. Story-specific tests validate its alternatives, effects, conditions, quests, terminal outcomes, and replay behavior.
- `examples/garden-adventure/src/world/` owns village and garden maps, typed anchors, graph edges, landmarks, interaction range, arrival completion, and reciprocal transitions.
- `examples/garden-adventure/src/scenes/` owns scene registry, orthographic camera, procedural landmarks, player, visible branch consequences, load cancellation, and disposal. `assets/` is the future local GLB replacement boundary.
- `examples/garden-adventure/src/ui/` owns accessible title, dialogue, quest objective, save, recovery, reset, and ending views. All authored child-facing Persian copy remains in `src/content/fa/`.
- `examples/garden-adventure/src/persistence/` owns the versioned save envelope, decoding, autosave, reset, and storage failure policy.
- `examples/garden-adventure/test/` holds unit and DOM tests. `examples/garden-adventure/e2e/` holds the dedicated full-playthrough, lifecycle and screenshot tests. The sample Playwright config is excluded from root Kids RPG E2E discovery.
- `scripts/check-framework-garden-consumer.mjs` reuses the existing temporary archive-consumer helpers. `scripts/capture-garden-previews.mjs` validates PNG signatures, dimensions, sizes, and SHA provenance after Playwright drives the production sample.
- `.github/workflows/sample-previews.yml`, `scripts/sync-sample-gallery.mjs`, the generated README gallery, and `docs/previews/garden-adventure/` extend the existing screenshot workflow.
- `examples/garden-adventure/README.md` documents this game. `docs/CREATING-A-SAMPLE-GAME.md` explains the checked-out public APIs and independent archive workflow.

## Decisions and scope

- Use the existing React, Three.js, React Three Fiber, Vite, Vitest, and Playwright versions without a new dependency unless the implementation proves one is needed.
- Use original procedural geometry and a single demand-rendered canvas, with an application-owned scene registry patterned on the public scene demo. Do not import scene-demo files.
- One story definition offers gardener and traveler choices. Each choice starts one quest. The gardener path requires collecting a seed then planting it. The traveler path requires revealing a stone clue then lighting the lantern. One-time condition-checked triggers update narrative facts and complete quests. Terminal branch outcomes remain mutually exclusive per playthrough.
- Players may exit dialogue freely, explore and change maps, and return to a recap after an ending. Arrival is committed only when the current requested path completes. Interaction dispatch validates the committed map and arrival anchor.
- Save only committed map, anchor, and narrative snapshot under `waypoint-rpg:garden-adventure:save`. Preserve corrupt or incompatible bytes until explicit recovery or reset. An unsuccessful clear disables future saves for that new session.
- Use all ten required screenshot filenames and capture only from the actual source-built production game. Capture on merges through the existing preview job, retaining its one review branch. Upload artifacts separately from the README proposal.
- Keep the phase statuses in `docs/FRAMEWORK-ROADMAP.md` unchanged. Do not push, open a PR, or merge.

## Implementation milestones

1. **S1 Audit and plan.** Record this architecture, file map, baseline and acceptance evidence. Commit this plan before implementation.
2. **S2 Independent bootstrap.** Add the standalone Vite app, locked tool dependencies, core runtime composition, and archive gate. Pack and install both package archives in a temporary directory outside this repository. Typecheck and build before adding gameplay.
3. **S3 Playable environments.** Add two connected navigable scenes, camera framing, keyboard/pointer controls, actual arrival commits, interactive targets, load cancellation, and cleanup. Verify premature, wrong-map and distant interactions are rejected.
4. **S4 Narrative.** Author Persian content and two condition-gated quests. Verify both full branches and visually distinct fact-driven consequences through public narrative exports only.
5. **S5 Persistence and gameplay tests.** Add the storage adapter and full branch tests. Cover save/reload, current map restoration, duplicate/stale/invalid commands, ending revisit, reset, corrupt/unsupported recovery, accessible controls and lifecycle cleanup.
6. **S6 Screenshots and docs.** Capture all ten states from the production build, record source and image hashes, extend the existing merge-triggered artifact and gallery workflow, write both docs, and commit.
7. **S7 Final verification.** Run `npm run verify`, the core, narrative, and scene consumer gates, the Garden archive consumer, unit and Playwright suites, screenshot generation, and applicable release rollback compatibility. Review diffs for package boundary violations and legacy behavior changes. Commit scoped changes and verify a clean worktree.

## Execution ledger

- S1 — complete. Rechecked merged PRs and package APIs, created the isolated feature branch from `db66865827f78db4c97a4347711e314e47c984d9`, installed locked dependencies, and recorded the baseline failure above. The baseline failure blocks the full suite at formatting only. No other baseline checks ran yet.
- Ruling — Use this plan’s ledger for progress because the installed SDD scratch helper could not start under Windows due to an MSYS signal-pipe permission error. The requested tracked plan already provides a durable, reviewable task record.
- Ruling — Include the formatting repair for the existing gallery generator with S6, the shared gallery changes that expose the issue. This keeps S1’s baseline evidence intact and allows final `npm run verify` to run in full.

## Verification and completion criteria

- Run baseline `npm run verify` before gameplay implementation and record the result. Run it again on the finished branch.
- Run `npm run framework:consumer`, `npm run framework:narrative-consumer`, and `npm run framework:scene-consumer` plus `npm run framework:garden-consumer`.
- Garden consumer installs built archives offline in its own `node_modules`, verifies package realpaths, ESM and declarations, rejects private imports, launches the production output, and drives both stories in software-WebGL Chromium.
- Garden unit and Playwright tests cover all acceptance cases in the original request, including actual committed arrival, visible restored consequences, no duplicated one-time effects, touch/keyboard and reduced motion, clean subscriptions, and no uncaught browser errors.
- `npm run sample:garden:previews` generates ten valid real-browser screenshots from a documented source commit. No screenshot is presented as a pixel-perfect test baseline.
- The game and new developer guide describe the actual public API, installed archive check, separate game-owned and reusable responsibilities, run/test/build/capture commands, offline behavior, and limitations.
- No files in `src/domain/`, `src/framework/`, or `src/app/` change. No story content enters `packages/`. The legacy Kids RPG keeps its existing save and deployment behavior.
- All S1–S7 commits are local. The final feature worktree is clean. Publishing and PR creation are outside authorization.

## Known verification limits

The browser acceptance gate uses Chromium and software WebGL. It does not verify physical devices or every browser. The preview workflow’s create-PR operation depends on repository Actions permissions, while artifact upload remains independent. Network access may prevent toolchain installation; report a real blocker with the failing command if offline cache recovery cannot resolve it.
