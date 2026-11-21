# waypoint-rpg-narrative

A game-neutral, dependency-free TypeScript ESM library for validating and
evaluating typed narrative definitions. The package contains no React, Three.js,
DOM, storage, or game-specific story content.

Phase 3 exposes the definition schema, `validateNarrative`, and
`compileNarrative`. Pure runtime transitions and persistence codecs are added
in the next implementation milestone. Only the package root is public.

```ts
import { compileNarrative, validateNarrative } from 'waypoint-rpg-narrative';

const report = validateNarrative(definition);
if (!report.ok) throw new Error(JSON.stringify(report.diagnostics));
const compiled = compileNarrative(definition);
```

`schemaVersion` identifies definition structure, `contentVersion` tracks
copy/presentation edits, and `compatibilityVersion` changes only when the
authored structure is incompatible with an existing playthrough. Consumers
own their save-envelope schema and storage policy.
