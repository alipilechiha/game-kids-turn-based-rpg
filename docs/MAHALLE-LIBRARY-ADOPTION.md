# محله مهربانی — library adoption and visual sample

## Purpose

Keep **محله مهربانی (Mahalle-ye Mehrabani)** as the repository's real, maintained
reference game for the optional RPG libraries. It remains the production
application **at the repository root** until a separately verified migration
preserves its Pages path, PWA install/offline behavior, IndexedDB profiles,
save compatibility, and user experience. Do not duplicate or fork it under
`examples/` merely to call it a sample.

The goal is a demonstrably library-backed game, not an unrelated screenshot
prototype. Its game-specific product policies still belong to the game.

## Audited integration status

<!-- prettier-ignore -->
| Capability | Current owner and evidence | Adoption status |
| --- | --- | --- |
| Runtime | `src/app/gameRuntime.ts` delegates to `createGameRuntime` through `src/framework/index.ts`, which re-exports `waypoint-rpg-core`. | **Adopted** |
| World IDs / graph / pathfinding | `src/world/navigation/graph.ts` re-exports generic helpers from the core package; world geometry/anchors remain application data. | **Adopted** |
| Persistence | Core supplies generic contracts; the game's `ProfileCoordinator`, `SaveCoordinator`, IndexedDB v2 and save schema v3 stay app-owned. | **Library contract; game-owned implementation** |
| Narrative / quests | `src/content/fa/dialogue.ts`, `src/domain/quests/`, `src/domain/game/reducer.ts`. | **Not yet migrated to the optional narrative package** |
| Battle | `src/framework/modules/battle/` and the facade, with game-specific quest abilities. | **Repository-local candidate for Phase 4 extraction** |
| 3D renderer | `src/world/WorldCanvas.tsx`, game models, camera and content policies. | **Game-owned; no reusable renderer published in Phase 2** |
| Screenshot evidence | `e2e/sample-previews.preview.ts` runs the game from its production build. | **Automatic source-rendered capture introduced by this PR** |

**Important semantic mismatch:** The child game intentionally permits
completed quests to be replayed, uses pictogram-first physical encounters,
reviewed child-facing copy, stickers, stable checkpoints, profiles, and gentle
non-punitive retries. The generic narrative package uses playthrough-scoped
one-time choices and terminal quest outcomes. Do not substitute it for the
legacy quest reducer without an explicit tested compatibility adapter.

## Safe migration sequence

1. **Protect existing behavior.** Keep `npm run verify`, the Playwright
   mobile shards, PWA rollback, save migrations, child safety and accessibility
   green. Capture the real hub, onboarding, dialogue and encounter screenshots
   on every merge to provide visible evidence of regressions.
2. **Prove library distribution.** Add an isolated installed-tarball
   acceptance test for the **real Kids RPG application**, not just for
   `examples/hello-world` and `examples/scene-demo`. Build in a clean
   directory using both packed packages with no monorepo-only import aliases.
   Keep the app entry point and deployment path unchanged.
3. **Narrative compatibility pilot.** Choose a small, noncritical dialogue and
   express it declaratively through the optional narrative package with a
   game-owned adapter. Compare output, availability, exit behavior, focus,
   translations, and persistence with the existing implementation. Do not
   introduce duplicate authoritative quest progress or modify the save schema
   to power a read-only/presentation pilot. If needed, add narrowly defined
   generic extension points to the library rather than child rules.
4. **Migrate only after parity.** Replace legacy dialogue/quest decisions in
   small independent PRs, preserving replay, checkpoint/watermark behavior,
   toddler UX, and content-review policy. Assert deterministic existing-save
   restore before and after each slice; do not silently change old content IDs.
5. **Phase 4+ modules.** Extract game-neutral tactical battle capabilities
   into an optional installable module, retain child-specific opponents,
   abilities and reward policy in the app, and repeat the independent consumer
   gate. Extract scene/rendering APIs only when multiple real consumers prove
   the reusable boundary.

## Visual preview pipeline

`npm run sample:previews` runs Playwright against `npm run preview` of the
**root game's actual production build**. It captures onboarding, town hub in
landscape/portrait, NPC dialogue and a quest encounter. The script uses actual
browser navigation and parent-gated quality settings. The screenshot runner is
excluded from the normal `*.spec.ts` E2E shards.

After every push/merge to `main`, `.github/workflows/sample-previews.yml`:

- installs the locked tools and Chromium plus an emoji-capable font;
- builds the root game and runs the sample preview scenario;
- publishes the PNGs as a GitHub Actions artifact even if a documentation PR
  cannot be created;
- creates or updates a **reviewable PR** containing the screenshots and
  README gallery, instead of committing directly to protected `main`.

Images are visual documentation, **not golden pixel assertions**. Small GPU,
font or browser rendering changes can produce changed PNGs; compare them in
the PR before merging. The captured app's educational/religious content may
still be draft and must not be represented as reviewed or approved.

## Acceptance criteria for calling the game a full library sample

- The actual app imports installed public package roots and passes an isolated
  tarball consumer build (not merely a Vite workspace-linked build).
- Domain behavior migrated to optional libraries has explicit equivalence
  tests for outcomes, repeated play, save/load and game-specific policies.
- No second source of truth for progression or persistent state.
- The original child experience, quality levels, parent controls, RTL,
  reduced motion, offline mode, assets and save compatibility are preserved.
- Playwright captures are generated from the same tested source commit.
- Every reusable library can still be consumed independently of this game.

**Current classification:** a **real core-backed reference game**, not yet a
fully narrative/combat/renderer-library-backed example. The status should
advance with evidence in code and CI, not through a label or README alone.
