# waypoint-rpg-core

A private, dependency-free ESM core library for RPG world structure, navigation, a generic state-machine runtime, and persistence contracts.

Phase 1 packages the existing core API. It does not provide a renderer, narrative engine, game content, persistence implementation, or a complete Three.js RPG engine. The Kids RPG remains the reference application and keeps its React, Three.js, React Three Fiber, PWA, save, and content policies.

The only supported package entry is the root export. The published surface is intentionally limited to the named values and types re-exported by `src/index.ts`; package subpaths are not public API.

This package is private during Phase 1 and is not published by this repository workflow.
