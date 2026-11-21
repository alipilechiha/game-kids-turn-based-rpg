# Independent 3D narrative consumer

This example validates two optional public packages in a separate Three.js
game: `waypoint-rpg-core` for generic runtime/world primitives and
`waypoint-rpg-narrative` for deterministic dialogue, quest, condition, effect,
and trigger transitions. The example does not import Kids RPG source. Its
scene registry, `SceneHost`, cameras, R3F scenes, DOM dialogue, persistence,
movement/interaction policy, and authored Persian content remain
application-owned.

The original fictional story, **برگ خون — The Blood Leaf**, offers two choices
with different facts and quest outcomes, condition-restricted endings, a
condition-checked lantern interaction, and a persistent workshop consequence.
The Persian UI is DOM-based and RTL. The native modal dialog manages keyboard
focus, prevents background interaction, and applies its authored exit policy.

## Run and verify

Use the repository toolchain: Node.js `>=22.22.2 <23` and npm `>=10 <11`.

```bash
npm run framework:watch
npm run framework:watch:check
npm --prefix examples/scene-demo run typecheck
npm --prefix examples/scene-demo run test
npm --prefix examples/scene-demo run build
npm --prefix examples/scene-demo run test:e2e
npm run framework:scene-consumer
```

`framework:watch` builds/watches both workspace libraries, waits for their
first successful outputs, then starts the scene-demo's Vite server. It uses
Vite's default linked-package resolver. The check edits both packages while
Vite is running, verifies default source reload, preserves the last good
output on a TypeScript error, and checks recovery after the source is restored.

`framework:scene-consumer` copies this example outside the monorepo, installs
the locked development tools, packs both libraries, installs both local
tarballs with npm offline, then typechecks, runs unit tests, builds with Vite,
and launches the Chromium narrative/lifecycle smoke. Development-tool
installation (`npm ci`) is a separate network/cache operation from installing
the library tarballs from local files. Offline package installation does not
mean a fresh Vite/React/TypeScript/Playwright toolchain can be installed
offline.

The core and narrative packages declare a Node.js `>=22.0.0` runtime floor and
have no runtime dependencies. Phase 3 package checks ran on Node.js 22.23.5;
the narrative package's declared minimum was not separately exercised. Root
build/test tooling requires Node.js `>=22.22.2 <23` and npm `>=10 <11`. The
pure narrative runtime has no browser API dependency. Browser execution is
validated in Chromium; this does not claim support for every browser or
physical device. The production Vite build may report a large Three.js bundle
warning.

## Save and scene ownership

The demo owns a separate localStorage envelope (schema version 1), including
story ID, content and structural compatibility versions, narrative snapshot,
committed map, and entry anchor. Copy-only content-version changes remain
loadable; incompatible structure or corrupt/unsupported bytes are preserved
for explicit recovery. A recovery session is session-only. A confirmed reset
invalidates pending work; when storage cannot be cleared, autosave stays off so
the new session cannot overwrite the preserved old bytes.

Startup validates stored state before the host restores its map at the saved
anchor. `SceneHost.start(mapId, entryAnchorId?)` keeps the default spawn
behavior and accepts only a known walkable anchor on that map. The game saves
a destination only after the scene load commits. Scene registration,
transitions, load cancellation, resource cleanup, two camera modes, and the
demand-rendered canvas remain owned by this example; no renderer package is
introduced.
