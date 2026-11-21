# Independent 3D scene consumer

This example is a second game consumer of `waypoint-rpg-core`. Its scene
registry, Three.js cameras, React Three Fiber scene components, and loading
lifecycle stay inside this example. It does not import Kids RPG source or add a
renderer API to the core package.

From the repository root, run `npm run framework:scene-consumer`. The command
builds the core once, copies this example to a temporary consumer directory,
installs the example's locked development tools, installs the locally packed
core tarball with npm offline, and runs type, unit, production-build, and
Chromium checks. The temporary consumer is not part of npm workspaces and is
removed after the check.

The development-tool install (`npm ci`) is a separate network/cache operation
from the offline package-archive install. The consumer build requires Node
22.22.2+ within Node 22 and npm 10. The core package's native Node runtime
minimum remains Node 22.0.0. Browser evidence in this example is Chromium with
WebGL; it does not claim compatibility with every browser or physical device.

The proof app registers a courtyard and workshop, validates both transition
directions against core waypoint paths, preserves the active map while a
destination loads, and disposes superseded or departed scene resources. It uses
one demand-rendered canvas, perspective and orthographic scene camera
configurations, and projects a runtime lantern fact into the workshop.
