# Phase 5 source model fixtures

These two small glTF 2.0 binary files are deterministic, procedural test sources
for the independent scene consumer. Their geometry and 8×8 PNG base-color
textures are authored by `examples/scene-demo/scripts/generate-phase5-fixtures.mjs`.
No marketplace model, AI provider, paid service, network download, or Kids RPG
asset is used.

| Fixture               | Contents                                                                                                                                                        | SHA-256                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `static-textured.glb` | One static box mesh with an embedded PNG and PBR base-color material.                                                                                           | `b17052af8c6222f82f800203b300090ee2db87d51cb28ecbd074cd692722caa6` |
| `rigged-animated.glb` | One textured skinned mesh, a two-joint root/shoulder skeleton, JOINTS_0 and WEIGHTS_0 attributes, and `idle`, `move`, `interact`, and `combat` animation clips. | `efd6cff098f6e10c65d90739446b0f8411bd4e455e565b40ada5820b1e6d90eb` |

Both files contain their geometry and PNG texture internally; they have no
external buffer or image references. The fixtures are synthetic implementation
tests and do not represent a marketplace or AI-generated model. They are
covered by this repository's root MIT `LICENSE`; no third-party attribution is
required.

Regenerate and validate the files from the repository root:

```sh
node examples/scene-demo/scripts/generate-phase5-fixtures.mjs
node examples/scene-demo/scripts/generate-phase5-fixtures.mjs --check
```

The generator re-reads the emitted bytes with the repository's installed
`@gltf-transform/core` and asserts that the embedded texture, PBR binding,
skin attributes, joint count, and named clips are present.
