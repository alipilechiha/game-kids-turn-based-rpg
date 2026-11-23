# Release — deployment runbook + ship checklist

Offline-first PWA, Persian RTL, ages 3–7. `npm run build` is the single gate:
content validation → asset registry → typecheck → Vite build → bundle budgets →
deploy-shape check. If any stage fails the build does not produce a dist/.

## 1. Deploying

The build is **subpath-safe by construction** — `check:deploy` fails on any
root-absolute asset ref, non-relative manifest URL, or missing precache entry.
To deploy under a subpath instead of the origin root:

```bash
npx vite build --base=/game/        # then re-run:
npm run check:budgets && npm run check:deploy
```

Everything follows the base: asset URLs, `manifest.webmanifest` (`./` paths),
the service-worker registration (`import.meta.env.BASE_URL`), SW scope, and
`navigateFallback`. There is no router — the SW serves `index.html` for every
navigation inside its scope.

Serving requirements (any static host):

- HTTPS in production (service workers require it; localhost is exempt).
- `sw.js` served with `Cache-Control: no-cache` (it's already `no-cache` on
  most static hosts — do **not** add `immutable`; the SW script itself must
  revalidate or updates never arrive).
- Everything else is a hashed precached asset — long immutable caching is fine.

## 2. Update lifecycle (cache invalidation)

Precached assets are content-hashed, `cleanupOutdatedCaches` is on — a new
deployment cannot serve stale chunks against a new shell. Saves live in
IndexedDB, outside the SW cache: an update never wipes progress.

Activation path: new SW installs → waits (`skipWaiting: false`) → the gated
**parent area** shows the update affordance → apply → `SKIP_WAITING` →
`controllerchange` → one reload onto the new shell. The child is never
interrupted mid-play by an update.

Never merge a change that reloads on install or activate — the safe update
point is the parent area only.

The focused `e2e/release-rollback.spec.ts` release check builds the pull
request base and candidate from source, installs the old worker, applies the
candidate through the parent-area control, resumes offline, saves newer quest
progress, then serves the old build again on the same origin. It confirms the
old app reads the newer save without replaying celebration. Run it locally
after `npm run build` with `npm run release:rollback:prepare -- origin/main`,
then run the focused test with `RUN_RELEASE_ROLLBACK=1`. PowerShell command:
`$env:RUN_RELEASE_ROLLBACK='1'; npx playwright test e2e/release-rollback.spec.ts --project=landscape-mobile`.
POSIX command: `RUN_RELEASE_ROLLBACK=1 npx playwright test e2e/release-rollback.spec.ts --project=landscape-mobile`.

## 3. Source-map policy

`build.sourcemap: 'hidden'` — Vite emits app maps in `dist/assets/` for
internal diagnostics, but app JavaScript does not advertise them. Workbox
maps are disabled explicitly because its generated worker otherwise advertises
them. `check:deploy` verifies the standard Vite map contains framework source
content and no built JavaScript advertises a map. `check:budgets` excludes
`*.map`; the Pages workflow removes map files before uploading its public
artifact. Keep diagnostic maps internal if an error reporter consumes them.

The deploy-shape check also inspects the built `dist/` tree and generated
service-worker precache. Package tarballs, declaration files, package/example
trees, and consumer fixtures must not enter the app artifact. All GLB and
audio files in the built output must remain precached; `perfProbe` remains
excluded.

## 4. CSP

`index.html` meta policy is intentionally tight (`default-src 'self'`,
`object-src 'none'`, `frame-src 'none'`, `upgrade-insecure-requests`). Known
allowances:

- `style-src 'unsafe-inline'` — inline critical CSS + runtime style attrs.
- `img-src data:` — generated icon/avatar data URLs.
- `script-src 'wasm-unsafe-eval'` — MeshoptDecoder WASM for shipped
  `EXT_meshopt_compression` GLBs. Does **not** allow JavaScript `eval`.

`frame-ancestors` must be set by the hosting HTTP header (meta CSP ignores
it). Production should send `Content-Security-Policy: frame-ancestors 'none'`.

Anything new requiring a CSP relaxation must be justified in review; do not
add remote origins.

## 5. Asset provenance

`scripts/validate-assets.ts` runs in every build. Every binary under
`public/audio/`, `public/icons/`, `src/assets/fonts/` must have a license
entry (`AUDIO_MANIFEST` for audio, `ASSET_REGISTRY` for the rest) — an
undeclared file or empty license **fails the build**. `npm run
validate:assets:release` additionally fails on `status: 'placeholder'` — run
it before a public content release (icons are currently placeholders;
music is licensed CC BY 4.0 — Clement Panchout, attribution rendered in the
parent area; SFX are original synthesis under the project MIT licence; fonts
are licensed Vazirmatn OFL-1.1). Full audio provenance: `docs/AUDIO.md`.

## 6. Ship checklist

Gate each before calling a build "released":

- [ ] `npm run verify` fully green
- [ ] `npm run validate:content:release` clean
- [ ] `npm run validate:assets:release` clean (no placeholder assets ship)
- [ ] Offline cold boot: install → airplane mode → fresh navigation plays
      (`e2e/pwa.spec.ts`)
- [ ] Reload after quest completion resumes progress
- [ ] Corrupted save → quarantine notice + fresh start (`e2e/pwa.spec.ts`)
- [ ] Same-origin old → candidate → old deployment retains candidate progress
      (`e2e/release-rollback.spec.ts`)
- [ ] IndexedDB unavailable → session-only fallback (`e2e/pwa.spec.ts`)
- [ ] Portrait 360×800 and landscape framings (`navigation.spec.ts`,
      `camera.spec.ts`)
- [ ] RTL render — icon/text order, connector direction
- [ ] Reduced motion — every state change still perceivable
- [ ] Muted audio mode
- [ ] Parent gate blocks parent surfaces (press-and-hold)
- [ ] PWA install prompt on target browsers
- [ ] Update flow on a real second deployment (no white screen, no wipe)
- [ ] Low-end device pass (real hardware, not emulation)
- [ ] Supervised child sessions — the acceptance gate (see `docs/QA.md`
      kid-testing protocol)

Last four require physical devices / adults — they cannot be automated.
