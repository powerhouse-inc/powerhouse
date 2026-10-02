# Plan: Make the reactor SharedWorker loadable in packaged Connect

Date: 2026-10-02 (against `main` at dabeba9600)
Status: proposal, not started. Written for agents implementing from `main`.
Paths are relative to the repo root unless marked as observed in a consumer
project.

## Motivation

Connect's shared-worker reactor mode (`connect.instance.reactorWorker`, or the
`?reactorWorker=true` override persisted under the `ph:reactorWorker`
localStorage key) does not work in any packaged deployment of Connect. It only
works in this monorepo's `apps/connect` dev server and build, which is why the
flag defaults to false and the breakage went unnoticed.

Observed in a real consumer project (`@powerhousedao/connect@6.2.3-dev.31`
installed via ph-cli, dev server on the `vetra.connectPort`):

```
Failed to fetch a worker script.
[reactor-worker] SharedWorker failed to load from
http://localhost:2452/node_modules/.pnpm/@powerhousedao+connect@6.2...
  /node_modules/@powerhousedao/connect/dist/reactor.worker.js
```

The tab then shows the "Lost connection to the reactor" banner within ~7s,
because the ping watchdog (`apps/connect/src/reactor-worker-client.ts:38-40`,
2s interval, 2 missed pings) never receives a pong. `ReactorHost` answers
pings before any reactor work (`packages/reactor-browser/src/rpc/reactor-host.ts:152`),
so an immediate "lost" always means the worker script never evaluated.

There are two stacked defects. Fixing only the first still leaves the worker
dead.

### Defect 1: the worker URL points into node_modules

`apps/connect/src/reactor-worker-client.ts:99-108` constructs the worker as

```ts
const workerUrl = new URL("./reactor.worker.js", import.meta.url);
const worker = new SharedWorker(workerUrl, { name, type: "module" });
```

`import.meta.url` is wherever the importing chunk was served from. In the
monorepo app that is a Vite-managed URL and Vite's worker handling takes over.
In a packaged deployment the chunk is Connect's prebuilt dist inside
`node_modules/.pnpm/...`, so the worker fetch is a cold request to a deep
node_modules path that no serving layer prepares, and it fails ("Failed to
fetch a worker script" — 404/403/MIME, exact dev-server cause to be confirmed
in Phase 0).

### Defect 2: the shipped worker has bare imports no worker can resolve

`apps/connect/tsdown.config.ts:14` builds `src/reactor.worker.ts` as a
**library** entry: tsdown externalizes dependencies, so the published
`dist/reactor.worker.js` begins with

```js
import { ... } from "@powerhousedao/reactor";
import { Kysely } from "kysely";
import { ... } from "@renown/sdk/crypto";
import { ... } from "./renown-trust-<hash>.js";   // own chunks, themselves
import { ... } from "./pglite-major-<hash>.js";   // full of bare imports
```

On the page, bare specifiers resolve through the `<script type="importmap">`
that `ph connect build` injects (`packages/builder-tools/connect-utils/vite-plugins/vendor-import-map.ts`),
pointing at the content-hashed vendor bundles in `__vendor__/`
(`prebuildConnectVendor`, `packages/builder-tools/connect-utils/externalize-vendor.ts`).
But **import maps are a document feature: workers do not inherit them and no
Worker/SharedWorker constructor option can supply one.** A bare specifier
inside a worker is unresolvable by the platform. Even a successfully fetched
`dist/reactor.worker.js` aborts on its first import statement.

The monorepo escapes both defects because `apps/connect/vite.config.ts:80`
builds from source: Vite statically detects `new SharedWorker(new URL(...))`
and bundles the worker's whole module graph as its own entry. Downstream
builds (ph-cli's `connect-build`) consume Connect's prebuilt dist, where the
`new URL(...)` expression is opaque runtime code Vite never re-processes.

## Design decisions

1. **Share vendor bytes, do not duplicate them.** The platform limitation is
   only about *bare specifiers*: workers import by URL just fine. So the fix
   is not "bundle everything into the worker" (which would double-download
   reactor/kysely/PGlite) but "rewrite the worker graph's bare imports to the
   same `__vendor__/` URLs the page's import map uses". Page and worker then
   share one HTTP-cache entry per dep (and, in Chromium, the URL-keyed V8 code
   cache). The vendor files are content-hashed and servable with
   `Cache-Control: immutable`. The page boots before the worker (the worker is
   constructed at tab wiring, built on first `hello`), so the worker's imports
   are warm-cache hits.

   Precedent: this is already how dynamically loaded packages work *inside*
   the worker. `WorkerPackageLoader`
   (`packages/reactor-browser/src/rpc/worker-package-loader.ts:12-17`) takes
   `sharedImports` ("worker import maps don't exist, so the source is
   rewritten to these URLs and blob-imported"). The gap is only that the
   worker's own static entry graph never got the same treatment. The vendor
   builder also already builds worker-flavored entries
   (`externalize-vendor.ts:835`, `worker: { format: 'es', plugins:
   connectDynamicBasePlugin({ forWorker: true, ... }) }`), so worker-safe
   vendor output and dynamic-base handling for workers exist today.

2. **The worker becomes an app-level artifact at a stable path.**
   `ph connect build` emits `<outDir>/reactor.worker.js` (plus its rewritten
   chunk closure) next to `__vendor__/`, and the tab constructs the
   SharedWorker from `<base>/reactor.worker.js` — never from a
   node_modules-relative `import.meta.url`. Dev servers serve the same path
   via middleware. This kills Defect 1 independently of Defect 2.

3. **Rewrite at consumer build time, in builder-tools.** Two candidate homes
   were considered:
   - (a) Connect's package build emits a self-contained worker bundle.
     Rejected as the primary approach: it duplicates every shared dep,
     defeats cache sharing, and still needs base handling for PGlite wasm
     assets. Kept as the documented fallback if (b) hits a blocker.
   - (b) `ph connect build` (and the dev servers) run a **worker-closure
     rewrite**: starting from Connect's `dist/reactor.worker.js`, walk the
     relative-import closure (`./renown-trust-*.js`, `./pglite-major-*.js`,
     `./pglite-migrate-core-*.js`, ...), copy each file into the app output,
     and rewrite every bare specifier to its vendor URL using the same
     `vendor.imports` table the page import map is built from. Chosen: one
     implementation in builder-tools serves every consumer (ph-cli build,
     dev, preview, future hosts), and it reuses the vendor as-is.

4. **Fail the build on unmapped specifiers.** Mirroring
   `missingVendorEntries` (`ph-cli` connect-build already fails when vendor
   files are missing), the worker rewrite must fail loudly when the worker
   closure imports a bare specifier absent from the vendor map, instead of
   emitting a worker that dies at runtime. Expected additions to the vendor
   include set (verify in Phase 1): `@renown/sdk/crypto`, `kysely`,
   `kysely-pglite-dialect`, `@powerhousedao/reactor`,
   `@powerhousedao/reactor-browser/rpc`,
   `@powerhousedao/reactor-browser/base-document-models`,
   `@powerhousedao/powerhouse-vetra-packages/document-models`, and the
   flag-gated dynamic imports (`@powerhousedao/vetra/document-models`,
   `@powerhousedao/workflow/document-models`).

5. **Deploy base handling.** For normal builds the rewrite bakes
   root-relative URLs (`/<base>/__vendor__/...`), same as
   `vendorImportMapEntries` does for the page. For dynamic-base builds the
   HTML-token substitution cannot reach a JS file, so reuse the existing
   `connectDynamicBasePlugin({ forWorker: true })` mechanism: the worker
   recovers the deploy base from its own `self.location` (the vendor build
   worker already strips a known URL prefix for exactly this,
   `externalize-vendor.ts:830-835`).

6. **Version skew stays guarded by the existing handshake.** Page and worker
   share the same hashed vendor files, and the `hello` fingerprint
   (`packages/reactor-browser/src/rpc/protocol.ts:49-58`: appBuildId, RPC
   protocol version, models, featureFlags) plus the `workerGen` reload
   convergence already handle a stale worker surviving a redeploy. No new
   mechanism needed.

7. **Fail fast in the UI.** Independent of the packaging fix: the tab already
   listens for the SharedWorker `error` event
   (`reactor-worker-client.ts:109-114`) but only logs. Wire it to
   `setWorkerConnectionStatus("lost")` immediately and distinguish the banner
   text ("failed to load" vs "stopped responding") so the next person does
   not need the ping timeout plus console archaeology to see a load failure.

## Non-goals

- Changing the RPC protocol, `ReactorHost`, or the reactor itself. The worker
  body is correct; only its packaging and addressing are broken.
- Flipping `reactorWorker` to default-true. That is a separate decision after
  the mode has soaked in packaged deployments.
- Service-worker precaching of the worker script. Browser support for SW
  interception of SharedWorker script/subresource fetches is inconsistent;
  the HTTP cache is the mechanism this plan relies on. SW precache of
  `__vendor__/*` remains a page-side win and needs no work here.

## Implementation checklist

### Phase 0 - Repro and diagnosis

- [ ] Add a failing repro: scaffold fixture project (or reuse an existing
      ph-cli e2e fixture) with `connect.instance.reactorWorker: true`; assert
      via Playwright that `window.ph.reactorClientModule.kind === "worker"`
      and that a document `get` round-trips (which requires a live worker).
      Run against both `ph connect` dev serve and `ph connect build` +
      preview.
- [ ] Confirm the exact dev-server failure mode for the worker fetch (403
      from `server.fs` outside the allow list built in
      `packages/builder-tools/connect-utils/vite-config.ts:386-428`, 404, or
      MIME). Record it in this plan's Deviations section; it decides whether
      the dev middleware in Phase 3 needs an fs-allow change as well.

### Phase 1 - Connect package build (apps/connect)

- [ ] Keep `reactor.worker` as a tsdown entry but make its output
      deterministic for consumers: stable entry filename (already
      `reactor.worker.js`) and document in the package README/CHANGELOG that
      `dist/reactor.worker.js` + its relative chunk closure is a consumer
      input, not a browser-loadable file.
- [ ] Enumerate the worker closure's bare-specifier set in a unit test
      (es-module-lexer over dist output in a build-check script), so a new
      worker dependency that is missing from the vendor include fails CI here
      rather than in ph-cli.
- [ ] `src/reactor-worker-client.ts`: construct the worker from a stable
      app-origin URL. Resolution order: explicit runtime-config value if we
      add one (follow `apps/connect/RUNTIME-CONFIG.md` lockstep steps) ->
      `<base>/reactor.worker.js`. Keep the current `import.meta.url` form
      only as the monorepo-dev fallback (Vite rewrites it there), gated so
      packaged builds never use it.
- [ ] Wire the SharedWorker `error` event to connection state (Decision 7)
      and split the banner copy in
      `apps/connect/src/components/connection-banner.tsx`.

### Phase 2 - Worker-closure rewrite (packages/builder-tools)

- [ ] New module `connect-utils/worker-rewrite.ts`:
      `rewriteReactorWorker({ connectDistDir, outDir, imports, base })`.
      Walk relative imports from `reactor.worker.js` (es-module-lexer; both
      static and dynamic import forms), copy each file to `outDir`, rewrite
      bare specifiers via `imports`, leave relative specifiers intact, apply
      base/dynamic-base per Decision 5. Return the emitted file list and the
      unmapped-specifier list.
- [ ] Hard-fail on unmapped specifiers with the same error shape as the
      vendor `missingVendorEntries` check in
      `packages/ph-cli` connect-build.
- [ ] Extend the production vendor include
      (`productionVendorInclude` in ph-cli connect-build + 
      `DEFAULT_VENDOR_INCLUDE` as appropriate) with the worker-only deps from
      Decision 4; respect the existing exclusions rationale (no
      `@powerhousedao/connect`, no bare `@powerhousedao/shared`).
- [ ] Fold the rewrite implementation into the vendor cache fingerprint the
      same way the vendor build worker already is
      (`externalize-vendor.ts:323-328`), so a rewrite-logic change busts
      stale outputs.
- [ ] PGlite wasm/data assets: the worker closure reaches
      `loadPGliteModule` (`pglite-major-*.js` chunk). Verify how its
      `new URL(...)` wasm/data references resolve post-copy and copy those
      assets alongside, or route them through the vendor (the vendor build
      already handles `new URL(..., import.meta.url)` carrying the
      placeholder, `externalize-vendor.ts:17`).
- [ ] Unit tests beside `externalize-vendor.test.ts`: closure walk, rewrite
      correctness (bare -> URL, relative untouched, dynamic imports), 
      unmapped-specifier failure, dynamic-base output.

### Phase 3 - Consumers (packages/ph-cli)

- [ ] `connect-build` (`src/services/connect-build.ts` equivalent in this
      repo): after the vite build, run `rewriteReactorWorker` into the app
      outDir; include its outputs in the post-build vendor-backing
      validation.
- [ ] Dev server (`connect-studio` / vetra serve path): middleware that
      serves `<base>/reactor.worker.js` and its closure by running the same
      rewrite against the dev import-map URLs (the dev equivalents used by
      `devReactImportmapPlugin`), cached in memory and invalidated with the
      vendor. Apply the Phase 0 finding if an fs-allow fix is also needed.
- [ ] `connect-preview`: confirm it serves the built output (static files
      only, nothing worker-specific should be needed once build emits them) 
      and sends `Cache-Control: immutable` for hashed assets
      (`__vendor__/*`, worker chunk closure) and revalidation for
      `reactor.worker.js` itself if it is emitted unhashed.

### Phase 4 - Verification

- [ ] Phase 0 e2e goes green in both modes (dev serve, build+preview).
- [ ] Two-tab test: both tabs report `kind: "worker"`, `chrome://inspect`
      shows exactly one `ph-reactor:*` worker, a document created in tab A
      appears in tab B via the change subscription.
- [ ] Cache-sharing assertion: in the build+preview e2e, collect the worker's
      network activity and assert the vendor requests are served from HTTP
      cache (Playwright CDP `Network.responseReceived` `fromDiskCache` /
      transferSize 0) after the page has loaded.
- [ ] Reload convergence still works: bump appBuildId between loads and
      assert the `reload` + `workerGen` path still lands all tabs on one
      fresh worker (existing tests in
      `packages/reactor-browser/test/rpc/reactor-host-protocol.test.ts`
      cover the protocol; this is the integration-level check).
- [ ] Browser-support note: verify SharedWorker-with-module-scripts coverage
      for the browsers Connect supports (Firefox has historically lacked
      module workers) and record the support matrix + fallback behavior
      (flag stays off / banner explains) in `apps/connect/RUNTIME-CONFIG.md`.

### Phase 5 - Docs and follow-ups

- [ ] Update the `reactorWorker` description in the runtime-config schema
      (follow `apps/connect/RUNTIME-CONFIG.md` lockstep: shared +
      builder-tools rebuild + `pnpm tsx scripts/emit-schemas.ts`) to state
      the supported serving modes.
- [ ] CHANGELOG entries for connect, builder-tools, ph-cli.
- [ ] File the default-on decision as a separate follow-up once packaged
      deployments have soaked.

## Risks and open questions

- **Worker closure size of the vendor include.** Adding worker-only deps to
  the vendor grows `__vendor__/` for all deployments, but vendor files are
  fetched on demand by import, so pages that never start the worker never
  fetch the worker-only entries. Verify no page-side import accidentally
  pulls them.
- **PGlite major/legacy duality.** The worker chooses a PGlite major at
  runtime (`pglite-major` chunk, `pglite-legacy-02` pins). Both majors'
  assets must survive the rewrite; the legacy path is exercised only on
  migrated profiles, so it needs an explicit test, not incidental coverage.
- **Blob-import interactions.** `WorkerPackageLoader.importSource`
  blob-imports rewritten package code; blob modules cannot resolve relative
  specifiers. Already handled for packages via absolute `sharedImports`
  URLs; the worker's own closure never goes through blob import under this
  plan (it is fetched from real URLs), but keep it that way - do not "reuse"
  the blob path for the entry.
- **Dev-mode root cause unknown until Phase 0.** If the dev fetch failure is
  MIME/transform rather than fs-allow, the middleware approach still covers
  it (it serves plain JS), but the finding may simplify Phase 3.
- **tsdown chunk hashing.** The worker closure's chunk names
  (`renown-trust-<hash>.js`) change per release; the rewrite discovers them
  by walking imports, never by name, so this is only a risk for anything
  that tries to precompute the list.

## Deviations

(Record implementation-time deviations from this plan here, per repo
convention.)
