# Plan: Real package loading for the Connect reactor worker

Date: 2026-10-02 (on `feat/reactor-worker-packaging`, after the worker
packaging work in `2026-10-02-reactor-worker-packaging.md`)
Status: implementing. Paths relative to the repo root.

## Problem

The shared-worker reactor can only obtain document models from three
channels: specs re-fetched from the registry CDN, the statically bundled
common/vetra/workflow model sets, and nothing else. A project's own
(`provider: "local"`) models never reach it, so documents of local types fail
with `DocumentNotFoundError` after their load jobs cannot find a reducer.
Two adjacent defects share the cause:

- In dev there is no vendor, so `WorkerPackageLoader` falls back to a raw
  `import(cdnUrl)` whose bare imports a worker cannot resolve - registry
  packages are broken in dev workers too.
- The `register-packages` RPC exists on the host and the worker implements
  it, but nothing on the tab ever sends it, and the loader's `loadedSpecs`
  cache has no replace semantics - a vetra `--watch` rebuild could never
  reach the worker even if wired.

## What the review established

1. The worker loads **models-only entries**
   (`<pkg>/browser/document-models/index.js`): no React, no CSS, no editors.
   Every built package ships that file, the project's own dist included.
2. `rewritePackageSource` is already a general specifier->URL rewriter; the
   vendor map is merely the only table anyone passes it.
3. **The dev server is already a worker-compatible bundler**: requesting the
   project's models entry through Vite dev returns it with relative imports
   absolutized and chunk bare imports rewritten to
   `/node_modules/.vite/deps/<dep>.js?v=...` - directly importable from a
   worker, verified live against a running `ph vetra`.
4. The vetra watch hook (`reactor-browser/src/hooks/vetra-packages.ts`)
   registers rebuilt models only into the tab-side registry; in worker mode
   that is the mirror, not the reactor.

## Design

Package *sources* - `{ name, version?, url }` - become the unit the worker
loads, replacing name-only specs for everything that is not a plain registry
fetch.

- **Wire**: `RpcHello.construct.packageSources` for boot;
  `register-packages` gains `sources` beside `specs`; RPC protocol version
  bumps to 3 (message shape change; the fingerprint converges tabs onto a
  fresh worker).
- **Loader**: `WorkerPackageLoader.loadSources(sources)` imports each source
  URL through the existing rewrite/blob pipeline (vendor map when present,
  direct import otherwise); `reloadSources(sources)` removes the source's
  previously registered module keys first and reports the touched document
  types so the worker can replace version families in the registry, the same
  semantics the tab hook uses. The loader also starts collecting the
  `upgradeManifests` export models entries ship, which it silently dropped
  before.
- **Dev URLs** (vetra / connect studio): the tab probes the project's models
  entry through the dev server (`<base>dist/browser/document-models/index.js`,
  HEAD + JavaScript content type) and passes it as a source; watch rebuilds
  re-send it with a cache-busting query. No build machinery: the dev server
  does the bundling.
- **Prod URLs** (`ph connect build`): the existing worker-bundle subprocess is
  generalized to N entries and a configurable vendor prefix;
  `prebuildWorkerPackages` builds each local package's models entry into
  `__reactor_worker__/packages/` with a `manifest.json` the tab fetches to
  discover them. Same vendor sharing, same bare-import guard.
- **Watch wiring**: `onVetraPackageManager` (new non-react helper beside the
  vetra hook) hands the package manager to the worker wiring in
  `store/reactor.ts`, which subscribes and posts `register-packages` with
  the busted dev URL; `WorkerReactorClientModule` gains `registerPackages`.

Deliberately out of scope, recorded as follow-ups: dev-mode registry
packages (needs a dev shared-imports map derived from the optimizer's URLs),
and editors/subgraphs in the worker (models are all the reactor needs).

## Checklist

- [ ] shared/connect: `workerPackageFileName` (shared by tab URL computation
      and the prod prebuild manifest)
- [ ] reactor-browser: protocol types + version bump; host passes sources
      through hello and register-packages; loader sources/reload/manifests;
      `WorkerReactorClientModule.registerPackages`; `onVetraPackageManager`
- [ ] apps/connect: worker construct + boot `loadSources`; registerPackages
      replace semantics (registry family replacement + manifest
      registration); tab source resolution (`worker-package-sources.ts`);
      store wiring (boot sources + watch subscription); client
      `registerPackages`
- [ ] builder-tools: generalize the build subprocess (entries map + vendor
      prefix); `prebuildWorkerPackages` + manifest.json
- [ ] ph-cli: build local-package model bundles in `ph connect build`
- [ ] tests: loader unit tests (sources, replace, manifests); builder-tools
      packages prebuild; connect source-resolution helpers
- [ ] e2e: static harness - boot with a packageSource, `createEmpty` of its
      type; `register-packages` replaces it and a new type becomes creatable
- [ ] distyra: rebuild worker bundle; verify against live vetra

## Known limitations

- In dev (`ph connect studio`), `provider: "local"` package models do not
  reach the worker; only the `ph connect build` prebuild bundles them. The
  project's own models do reach it through the dev models entry.

## Deviations

- Watch wiring: `store/reactor.ts` subscribes to the package manager
  directly and forwards a `register-packages` only when its `localPackage`
  is replaced (an HMR `updateLocalPackage`), not on every package
  notification; `onVetraPackageManager` is no longer used there.
