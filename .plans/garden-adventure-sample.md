# باغ قصه‌ها — Phase 1–4 Sample Implementation

## Objective and constraints

Deliver a complete, independently playable Persian 3D RPG at
`examples/garden-adventure/` using the public roots of `waypoint-rpg-core`,
`waypoint-rpg-narrative`, and `waypoint-rpg-gameplay`. The sample demonstrates
Phases 1–4 without adding Garden content to reusable packages or changing the
Kids RPG, Blood Leaf, or hello-world behavior. Do not push, open a PR, or merge.

The sample contains two connected environments, a gardener story path with
inventory and planting, a guardian path with genuine package-backed tactical
combat, two positive endings, a non-punitive withdrawal outcome, coordinated
save/restore/reset, production Chromium gameplay tests, and actual browser
screenshots. Phase 5 cinematics and Phase 6 editors are outside scope.

## Baseline and source audit

- Phase 4 merge evidence: PR #116, commit
  `693aae689065d108e84b85a16c5651d625c29ab2`.
- The cached `origin/main` points to that merge commit. A fresh `git ls-remote`
  request could not reach GitHub in this environment, so a newer remote tip
  could not be confirmed during finalization.
- The actual current package roots and exported APIs were inspected before the
  Garden integration. No package internals are imported by the sample.
- The existing screenshot workflow was extended in place; it retains one
  reviewable gallery PR path and uploads preview artifacts after captures.
- `src/domain/`, `src/framework/`, and `src/app/` have no Garden changes.
- The root Kids RPG save format and IndexedDB schema are unchanged.

## Dependency and transaction model

```text
Browser UI and sample-owned Three.js scenes
                 │ validated game commands
                 ▼
     Garden coordinator and reducer
       ├── waypoint-rpg-core runtime and navigation
       ├── waypoint-rpg-narrative story snapshot
       ├── waypoint-rpg-gameplay combat/progression snapshot
       ├── trusted cross-package outcome transaction
       └── isolated, versioned Garden save adapter
```

The application reducer owns the combined durable state and domain policy.
Core hosts the runtime and graph/pathfinding primitives. Narrative owns the
authored story transition machine. Gameplay owns character progression,
inventory/equipment, abilities/statuses, tactical combat, rewards, and its
snapshot codec. The app validates location/arrival and interaction ownership.
Rendering projects committed facts and gameplay selectors; it does not write
domain state.

Combat terminal actions pass through `transitionGameplay`. The coordinator
verifies the accepted terminal outcome, playthrough and encounter instance,
maps only the authored consequence ID to a fixed narrative trigger, and applies
`transitionNarrative`. It commits both resulting snapshots only if both package
transitions accept. Rejection preserves the original combined state. Rewards
are package-owned and replay-protected; the browser UI cannot dispatch trusted
grants, enemy turns, or arbitrary narrative triggers.

## Implemented file map

- `examples/garden-adventure/src/game/` composes the three public packages,
  validates map/anchor and interaction ownership, and contains the
  cross-package transaction coordinator.
- `examples/garden-adventure/src/content/story.ts` and
  `src/content/gameplay.ts` hold all Garden-specific definitions and stable
  authored IDs. `src/content/fa/` holds the Persian interface copy.
- `examples/garden-adventure/src/world/` defines the village and garden,
  navigation anchors, gates, and committed arrivals.
- `examples/garden-adventure/src/scenes/` owns the map registry, procedural
  landmarks, camera, player presentation, load cancellation, disposal, and
  projections of story facts into a grown tree or lit lantern.
- `examples/garden-adventure/src/persistence/` owns the isolated versioned save
  envelope, package snapshot decode/encode, migration, recovery, reset, and
  storage-failure behavior.
- `examples/garden-adventure/src/ui/`, `App.tsx`, and `style.css` provide the
  title, RTL HUD, interactions, inventory/equipment, tactical board, endings,
  responsive layouts, keyboard/touch controls, and accessibility behavior.
- `examples/garden-adventure/test/` contains story, runtime, gameplay, and
  persistence tests. `e2e/` contains full production browser paths, safety and
  lifecycle checks, plus real preview captures.
- `scripts/check-framework-garden-consumer.mjs` builds and packs all packages,
  installs the archives in a temporary consumer outside the checkout, checks
  root-only ESM and TypeScript declarations, then builds and smoke-tests Garden.
- `scripts/capture-garden-previews.mjs` validates source-rendered PNGs and
  records source/image SHA-256 provenance.
- `.github/workflows/sample-previews.yml` extends the existing merge-triggered
  preview/artifact/gallery proposal flow. `scripts/sync-sample-gallery.mjs`
  generates the three-game README gallery.
- `examples/garden-adventure/README.md` and
  `docs/CREATING-A-SAMPLE-GAME.md` document the sample and its actual package
  boundaries/APIs. `docs/FRAMEWORK-ROADMAP.md` remains the roadmap source of
  truth; `npm run roadmap:sync` generates its README copy.

## Milestone ledger

### S1 — Source audit and plan: complete

Inspected the three public package APIs, existing examples, consumer scripts,
roadmap source, and merge-triggered preview workflow. Recorded the verified
PR #116 baseline and implementation file map above. The cached `origin/main`
points to the PR #116 merge; `git ls-remote` could not reach GitHub, so a newer
remote tip could not be confirmed.

### S2 — Sample bootstrap and independent consumer gate: complete

Added the Vite/React app and a three-package archive consumer. The gate builds
and packs the compiled packages, installs each archive independently in a
temporary consumer outside the checkout, rejects deep imports, verifies native
ESM plus NodeNext/Bundler declarations, then type-checks, unit-tests,
production-builds, and launches Chromium against the app. Locked toolchain
installation is separate from offline package archive installation.

### S3 — World and interaction: complete

Added registered village and garden scenes, camera framing, pointer/keyboard/
touch targets, graph navigation, validated map transitions, committed-arrival
checks, async cleanup, and WebGL context recovery. Procedural landmarks are
sample-owned and can be replaced through a future local GLB asset boundary.

### S4 — Narrative and gardener path: complete

Added the authored Persian story, condition-gated choices and quests, one-time
triggers, endings, gardener seed objective, package-backed inventory and
consumption, reward/equipment/progression, and fact-driven tree growth. The
gardener route completes without combat.

### S5 — Tactical gameplay and guardian path: complete

Added a real package-backed 5×5 encounter with validated movement, turn
ownership, resource-checked abilities, deterministic enemy decisions,
temporary status effects, rewards, and terminal markers. The application
verifies the committed outcome and atomically applies only its authored
narrative consequence. Withdrawal returns a gentle retry state.

### S6 — Persistence and regression tests: complete

Added the isolated version-2 save envelope for both package snapshots, shared
playthrough ID, current map/anchor, mid-combat restoration, ending restoration,
reset, v1 Garden migration, corrupt/unsupported recovery, and storage
exceptions. Garden unit tests pass 19/19; its production Chromium gameplay suite
passes 13/13, including both story paths, replay/invalid-command guards,
cross-package rollback, lifecycle, touch/keyboard, reduced motion, and restored
world visuals.

### S7 — Screenshots, documentation, roadmap and CI: complete

- Captured twelve production-built Chromium states under
  `docs/previews/garden-adventure/`, including both outcomes, the tactical
  board, ending, portrait view, and restored save.
- The manifest records source commit
  `bfb3d8a892f0fc4dc4c4ff3318486dea43cd381f`, image dimensions, byte counts,
  and SHA-256 values. Preview tests passed 2/2 and wait for actual WebGL/scene
  state before capture.
- Updated the sample README, three-package authoring guide, and generated
  gallery with the real screenshots and accurate capability labels.
- Updated the authoritative roadmap with Phase 4 Complete, Phase 5 Next, and
  PR #116 plus package/integration evidence. The README roadmap was regenerated.
- Extended the existing merge-triggered workflow to run the Garden consumer and
  preview capture while retaining artifact upload and the single reviewable
  gallery PR path.

### S8 — Final verification and scoped local commit: complete

The full `npm run verify` passed, including all 52 root test files (521 tests),
content and asset checks, build budgets, and both existing example builds. The
core, narrative, and scene consumers passed. Gameplay boundary, build, and
prepared tests passed (29/29). The independent three-package Garden consumer
passed each isolated archive ESM/declaration probe, combined sample checks,
production build, and Chromium smoke. Garden unit/E2E/preview suites passed
19/19, 13/13, and 2/2 respectively. `npm run sample:gallery`,
`npm run roadmap:check`, and `npm run format:check` passed on the final tree.

Generated TypeScript build-info changes were restored. The scoped work is
committed locally on `codex/garden-adventure-sample`; publishing was not
authorized and was not attempted.

## Verification matrix

| Command/check                                                  | Recorded evidence                                                                           |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `npm run verify`                                               | Passed; 52 root test files and 521 tests, content/asset checks, budgets and builds          |
| `npm run framework:consumer`                                   | Passed; independent core archive, declarations, Vite and Chromium                           |
| `npm run framework:narrative-consumer`                         | Passed; narrative archive, NodeNext/Bundler and offline install                             |
| `npm run framework:scene-consumer`                             | Passed; core+narrative archive, build and Chromium lifecycle smoke                          |
| `npm run framework:gameplay:check` / `build` / `test:prepared` | Passed; 29/29 package tests                                                                 |
| `npm run framework:garden-consumer`                            | Passed; three independent archives, declarations, sample build and Chromium on Node 22.23.5 |
| `npm run sample:garden:test` / `e2e`                           | Passed; 19/19 unit tests and 13/13 Chromium tests                                           |
| `npm run sample:garden:previews`                               | Passed; 2 preview tests captured 12 validated production PNGs                               |
| `npm run sample:gallery`                                       | Passed; all three screenshot manifests validated                                            |
| `npm run roadmap:check` / `format:check`                       | Both passed on final tree                                                                   |
| Root Kids RPG compatibility                                    | Root unit suite passed; protected gameplay and save files unchanged                         |
| Node 22.0.0 runtime floor                                      | Dedicated CI probe configured; no local 22.0.0 binary or workflow run available             |

The workflow configures a separate Node 22.0.0 runtime probe for the gameplay
package. Local archive checks ran under Node 22.23.5. GitHub Actions was not
run from this worktree, so the Node 22.0.0 result is unavailable and must not
be reported as locally verified. A fresh GitHub `main` lookup was blocked by
the environment's network connection; the cached ref is the PR #116 merge.

## Acceptance review

- [x] Garden launches and both authored story paths are playable.
- [x] The guardian route uses package combat rather than dialogue-selected
      results.
- [x] Narrative and gameplay snapshots are coordinated transactionally and
      persisted together.
- [x] Progress, outcomes, item/equipment state, and scene consequences survive
      reload.
- [x] Three framework packages are consumed through public package roots.
- [x] Production Chromium tests and source-rendered screenshots exist.
- [x] README gallery, sample guide, authoring guide, and roadmap identify the
      actual demonstrated capabilities.
- [x] Root Kids RPG protected gameplay and save code were not changed.
- [x] Final repository and independent-consumer checks complete on the final
      docs/screenshot tree.
- [x] Scoped implementation and evidence commits are local; no push or PR was
      created.
