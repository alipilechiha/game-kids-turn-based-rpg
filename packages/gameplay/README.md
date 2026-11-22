# waypoint-rpg-gameplay

An optional, game-neutral TypeScript ESM package for validated RPG gameplay definitions. It has no runtime dependencies and does not import `waypoint-rpg-core`, the narrative package, React, Three.js, browser APIs, or application code.

Phase 4.1 provides a versioned schema, precise authoring validation, and an immutable compiled-definition boundary. The pure state machines for progression, inventory, equipment, abilities, status effects, and tactical encounters are added in later milestones.

The package has one supported public entry, `waypoint-rpg-gameplay`. Deep imports are intentionally blocked. Definitions contain data only; executable callbacks and scripts are not supported.

## Development

From the repository root, run `npm run framework:gameplay:check`, `npm run framework:gameplay:build`, and `npm run framework:gameplay:test:prepared`. `npm run verify` orchestrates the framework build before the prepared package and application checks.

The package declares a Node.js runtime floor of 22.0.0 for native ESM. Its TypeScript build tool belongs to repository development tooling and runs on the root project's Node.js engine. The runtime floor does not claim support for any particular browser.
