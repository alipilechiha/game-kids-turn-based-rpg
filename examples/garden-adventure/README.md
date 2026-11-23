# باغ قصه‌ها — Garden of Stories

Garden of Stories is a short, family-friendly Persian 3D RPG that exercises
`waypoint-rpg-core`, `waypoint-rpg-narrative`, and
`waypoint-rpg-gameplay` as independently packaged libraries. Choose to help a
gardener restore a tree or follow a clue to a friendly guardian's tactical
light game. Both paths change the garden and lead to a positive ending.

The game runs in a browser without a backend, account, analytics, or runtime
external API. Its RTL interface is DOM-based, including dialogue, inventory,
quest status, combat controls, and endings. Saves use a Garden-only key and do
not access the Kids RPG's IndexedDB profiles or the scene demo's storage.

## Real production screenshots

`npm run sample:garden:previews` drives the production build in Chromium with
software WebGL. `provenance.json` records the source commit, dimensions, and
SHA-256 for every image. Captures document real game states; they are not
pixel-perfect regression baselines.

| Capture                 | Screenshot                                                                                                 |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| Title                   | ![Garden of Stories title](../../docs/previews/garden-adventure/01-title.png)                              |
| Village                 | ![Village before the quest](../../docs/previews/garden-adventure/02-village.png)                           |
| Persian dialogue        | ![Gardener dialogue](../../docs/previews/garden-adventure/03-dialogue.png)                                 |
| Inventory and equipment | ![Inventory and equipment](../../docs/previews/garden-adventure/04-inventory.png)                          |
| Garden before           | ![Garden before restoration](../../docs/previews/garden-adventure/05-garden-before.png)                    |
| Gardener outcome        | ![Grown tree after planting](../../docs/previews/garden-adventure/06-garden-restored.png)                  |
| Tactical battle         | ![Five by five guardian trial](../../docs/previews/garden-adventure/07-tactical-battle.png)                |
| Ability effect          | ![Temporary status and active ability effects](../../docs/previews/garden-adventure/08-ability-effect.png) |
| Guardian outcome        | ![Lit lantern after the guardian trial](../../docs/previews/garden-adventure/09-guardian-outcome.png)      |
| Story ending            | ![Guardian path ending](../../docs/previews/garden-adventure/10-ending.png)                                |
| Portrait layout         | ![Mobile portrait viewport](../../docs/previews/garden-adventure/11-mobile.png)                            |
| Restored save           | ![Restored saved garden](../../docs/previews/garden-adventure/12-restored.png)                             |

## Architecture

```mermaid
flowchart TD
  UI[Persian DOM UI and Three.js scenes] -->|validated game commands| R[Garden runtime and reducer]
  R --> C[waypoint-rpg-core public root]
  R --> N[waypoint-rpg-narrative public root]
  R --> G[waypoint-rpg-gameplay public root]
  S[Game-owned story and gameplay definitions] --> N
  S --> G
  R --> X[Application cross-package transaction]
  X -->|verified outcome trigger| N
  X -->|committed encounter rewards| G
  R -->|facts, quest, progression, map| UI
  R --> P[Garden-owned versioned save adapter]
  P -->|decoded snapshots| R
```

### Core runtime and world navigation

The application composes `createGameRuntime<GardenState, GardenCommand>` with
one pure reducer. `waypoint-rpg-core` provides the runtime, graph traversal,
`findPath`, and world types. Garden owns scene registration, map and target
ownership, path movement, arrival commits, interaction range, and the
`ARRIVE`/transition rules. A reachable path does not count as an arrival: the
reducer verifies each committed waypoint before the player can interact.

The village contains a fountain, market shelter, gardener, traveler, seed
basket, and the garden gate. The garden contains the planting bed, hidden clue,
ancient lantern, guardian, and return gate. `src/scenes/registry.ts` validates
the map/graph pairings. A single demand-rendered R3F canvas loads the selected
scene, and the sample-owned camera, probe, and scene components dispose their
listeners on unmount. During movement the player is rendered toward the next
route anchor while the reducer retains its last committed anchor. The scene
probe observes the player at that destination across consecutive frames, with a
render between observations, before asking the runtime to dispatch `ARRIVE`.
The runtime rechecks the map, playthrough, route, next index, and committed
anchor; stale callbacks after reset or scene replacement cannot advance state.
This keeps arrival synchronized to rendered motion without a wall-clock timer.
Camera and rendered consequence probes are used by browser checks. The visible
tree and warm lantern lighting are projections of committed narrative facts.

Geometry is procedural and sample-owned. Landmark component boundaries in
`src/scenes/GardenScene.tsx` keep artwork replaceable by locally bundled GLB
models without moving story, movement, or interaction rules into assets. No
generated model or external asset service is needed.

### Narrative and gameplay packages

`src/content/story.ts` authors stable dialogue, choice, quest, fact, trigger,
and ending IDs. The runtime uses `validateNarrative`, `compileNarrative`,
`createNarrativeState`, `transitionNarrative`, `getDialogueView`,
`getQuestStatus`, `getFact`, and `decodeNarrativeState` through the public
narrative root. Persian interface copy is in `src/content/fa/ui.ts`.

`src/content/gameplay.ts` owns the hero and guardian definitions, attributes,
resources, three items, charm equipment, abilities, temporary statuses, 5×5
board, encounter, enemy policy, outcome mapping, and bounded victory reward.
The application uses `validateGameplay` in sample tests and
`compileGameplay`, `createGameplayState`, `transitionGameplay`,
`applyGameplayGrant`, `getCharacterLevel`, `getCharacterAttributes`,
`getEffectiveCharacterAttributes`, `getUnlockedAbilityIds`,
`getInventorySlotCount`, `encodeGameplayState`, and `decodeGameplayState` via
the gameplay package root. UI renders those selectors and transition results;
it does not simulate turns, derive equipment modifiers, grant rewards, or
change quests.

Path A grants one special seed, consumes it at the planting bed, completes the
gardener quest, grants experience and two items, equips the charm, and grows a
blossom tree. Path B requires the traveler's clue before the guardian can be
challenged. The gameplay package owns movement validation, turn ownership,
range/resources, deterministic enemy turns, status effects, terminal outcome
markers, replay checks, and victory rewards.

### Cross-package combat transaction

`applyBattleAction` in `src/game/runtime.ts` owns the trusted transaction. It
checks map, playthrough, gameplay revision, and encounter-instance identity,
then passes the intent to `transitionGameplay`. For a terminal result it
verifies the gameplay package's committed outcome marker against the authored
encounter mapping, maps only that known consequence to a pre-authored narrative
trigger, and runs `transitionNarrative` with its current revision. The reducer
commits the resulting gameplay and narrative snapshots together only if both
accept the result. A rejected trigger returns the original combined state.
The UI cannot dispatch internal enemy decisions, reward grants, or arbitrary
story triggers.

Winning illuminates the ancient lantern and completes the lantern quest.
Withdrawal or an exhausted challenge produces a gentle retry message and keeps
the quest available. The two victories have different visible world facts and
ending text; defeat is not punitive.

## Save architecture

`src/persistence/garden-save.ts` owns the isolated
`waypoint-rpg:garden-adventure:save` key and a strict version-2 envelope with
the current map/anchor, shared playthrough identity, narrative snapshot, and
the gameplay package's encoded snapshot. Both package decoders run before
restore, and the adapter rejects inconsistent story facts, rewards, encounter
markers, or map/anchor pairs. Version-1 narrative-only Garden saves are
migrated using bounded gameplay grants.

New game, save, continue, active-combat reload, completed-story reload, reset,
corrupt/future-version recovery, and storage exceptions are supported. Invalid
bytes remain untouched until explicit reset; an unavailable storage session
can still be played without saving. Storage code remains outside package
reducers and the narrative/gameplay libraries.

## Build, play, and test

Use the repository's pinned Node 22 and npm 10 toolchain from the repository
root:

```bash
npm ci
npm run sample:garden:dev
npm run sample:garden:build
npm run sample:garden:test
npm run sample:garden:e2e
npm run framework:garden-consumer
```

The browser suite runs the complete gardener and guardian paths, including a
mid-combat reload. The independent consumer gate packs all three compiled
libraries, copies Garden outside the checkout, installs each archive offline,
verifies root-only ESM and declarations in NodeNext and Bundler modes, then
type-checks, unit-tests, builds, and launches Chromium against that install.
Development-tool installation is separate from offline archive installation.

To capture the twelve screenshots from the production app, install Chromium
once and run:

```bash
npx playwright install chromium
npm run sample:garden:previews
```

The capture waits for a live canvas, orthographic camera, populated scene,
active map, and rendered world consequence. It checks each PNG's signature,
dimensions, size, and hash before writing the source-commit provenance manifest.
The existing `sample-previews.yml` workflow uploads all sample captures and
uses the existing reviewable README-gallery pull request path.

## Known limits

- Chromium software-WebGL is verified; other browsers and physical touch
  devices remain unverified.
- Art is lightweight procedural geometry. A locally licensed GLB art pass is
  a future replacement, not a runtime dependency.
- The encounter is one deterministic friendly challenge, not a general combat
  campaign. There is no multiplayer, inventory crafting, or cinematic system.
- Vite reports the expected large Three.js bundle warning in this small sample.
