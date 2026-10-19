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

- [x] Repro covered by a live browser e2e against the built bundle (see
      Deviations: playwright-cli against a static serve of the bundle, ping ->
      hello -> reactor boot -> RPC query), run for both the self-contained
      and the vendor-sharing bundle. A scaffolded ph-cli fixture project
      remains follow-up work for CI.
- [x] The exact dev-server failure mode became moot: the tab no longer
      derives a node_modules URL at all (see Deviations). The dev middleware
      serves the prebuilt bundle at the stable path instead.

### Phase 1 - Connect package build (apps/connect)

- [x] `reactor.worker` stays a tsdown entry with its stable filename; it is
      now a build input for `prebuildReactorWorker`, never fetched directly.
- [x] Closure enumeration is enforced at bundle time instead of in CI here:
      `prebuildReactorWorker` fails with the offending file + specifier when
      anything unresolvable survives in the emitted graph.
- [x] `src/reactor-worker-client.ts` takes a `workerUrl`;
      `src/store/reactor.ts` resolves it by fetching
      `<base>__reactor_worker__/worker-meta.json` (GET + JSON content-type,
      so an SPA fallback's index.html does not count) via
      `src/utils/reactor-worker-url.ts`. The meta's `sourceDigest` joins the
      version fingerprint. The monorepo app falls back to the
      `import.meta.url` form; a packaged dist with no bundle reports the
      worker unavailable.
- [x] SharedWorker `error` -> `setWorkerConnectionStatus("failed")`
      immediately (not downgraded by the ping deadline), with its own banner
      copy in `connection-banner.tsx`.

### Phase 2 - Worker bundle prebuild (packages/builder-tools)

- [x] New module `connect-utils/reactor-worker-build.ts`:
      `prebuildReactorWorker` builds the worker graph with a second
      `vite build` in a throwaway subprocess (same pattern as the vendor
      prebuild) instead of a hand-rolled text rewrite - see Deviations.
      Vendor-mapped specifiers are externalized onto `../__vendor__/<entry>.js`
      via rollup `external` + `output.paths`; everything else is bundled.
- [x] Post-build guard: `findBundleSpecifierOffenders` walks the emitted
      import graph from the entry and fails the build naming any specifier a
      worker cannot resolve.
- [x] Vendor include extension dropped: unnecessary under the build approach
      (unmapped deps are bundled, not failed) - see Deviations.
- [x] Cache fingerprint folds in the build-worker source, the connect dist
      identity, the vendor's import-map.json, and the (filtered) external
      set; concurrent builders share the vendor's lock mechanism.
- [x] PGlite wasm/data assets are handled by the vite build itself under
      relative base (`new URL("./assets/...", import.meta.url)`); its nested
      workers are inline blob workers. Verified on the real graph.
- [x] Unit tests in `connect-utils/reactor-worker-build.test.ts`: specifier
      scan (minified, member-call false positives, URL forms), graph-walk
      exemption of stray node-worker assets, vendor path mapping,
      worker-safety filtering, real subprocess build + cache reuse +
      missing-entry reporting.

### Phase 3 - Consumers (clis/ph-cli, builder-tools dev server)

- [x] `connect-build` runs `prebuildReactorWorker` into
      `<dist>/__reactor_worker__` after the vendor prebuild, keeps both dirs
      across the stale-output clean and the app build (`emptyOutDir: false`),
      and fails the build only when `connect.instance.reactorWorker` is
      explicitly on (otherwise warns and degrades). `PH_CONNECT_REACTOR_WORKER=0`
      disables the prebuild, mirroring `PH_CONNECT_VENDOR`.
- [x] Dev server: `reactorWorkerDevPlugin` (registered in
      `getConnectBaseViteConfig`, serve-only) builds the bundle lazily on
      the first GET (the tab's `worker-meta.json` fetch) into `node_modules/.ph-reactor-worker` (self-contained in dev), with
      immutable caching for hashed files.
- [x] `connect-preview` needs nothing worker-specific: the bundle is static
      files in the dist. (Preview-side immutable headers for `__vendor__/*`
      remain a pre-existing follow-up.)

### Phase 4 - Verification

- [x] Browser e2e (playwright-cli, headless Chromium) against a static serve
      of the bundle: worker script loads, `ReactorHost` answers ping, a full
      `hello` builds the reactor over PGlite in the worker, and an RPC
      `isDocumentIdTaken` round-trips - in BOTH modes (self-contained, and
      vendor-sharing with a real production vendor of document-model + zod +
      reactor-browser).
- [x] Two-tab test: both tabs report the same worker `ownerId` (one
      SharedWorker, one reactor; the second tab's boot is instant because
      the worker is already up).
- [x] Worker-safety filter verified on the real vendor: react-entangled
      entries (bare `document-model` included, via chunk sharing) are
      demoted to bundling; the zod family and `reactor-browser/graphql`
      stay shared.
- [ ] Cache-sharing network assertion (vendor requests served from HTTP
      cache) - not automated; the mechanism (same URLs, hashed files) is in
      place. Follow-up alongside the CI fixture.
- [ ] Reload convergence integration check - unchanged code path; protocol
      tests still pass. Follow-up alongside the CI fixture.
- [ ] Browser-support matrix note in RUNTIME-CONFIG.md - follow-up.

### Phase 5 - Docs and follow-ups

- [x] `reactorWorker` schema description updated (schema-fragments.ts +
      regenerated runtime-config.schema.json / source-config.schema.json via
      the lockstep procedure).
- [x] CHANGELOGs are release-generated from conventional commits in this
      repo; no manual entries.
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

1. **A second vite build replaced the text rewrite.** The plan proposed
   walking Connect's dist worker closure and string-rewriting bare specifiers
   to vendor URLs. The implementation instead runs the worker entry through
   its own `vite build` in a subprocess (`prebuildReactorWorker`), the same
   pattern as the vendor prebuild: rollup `external` + `output.paths` handle
   the vendor mapping, the bundler handles PGlite's wasm/data assets and
   dynamic imports, and anything not in the vendor is bundled rather than
   failing the build. This made the planned vendor-include extension and
   unmapped-specifier hard-fail unnecessary.

2. **Relative base instead of dynamic-base machinery.** The bundle builds
   with Vite `base: "./"`, so chunk and asset URLs resolve against the worker
   script's own URL under any deploy base. No placeholder, no `forWorker`
   prelude. Vendor references are `../__vendor__/<entry>.js` - which forced
   chunks to the bundle root (rolldown emits `output.paths` values verbatim,
   so all modules must sit at one depth).

3. **Worker-safe vendor filtering (not in the plan).** The vendor keeps React
   external: its chunks carry bare `import "react"` that only a page import
   map resolves. Externalizing a vendor spec whose chunk closure reaches such
   an import would kill the worker, and chunk sharing entangles even
   React-free entries. `workerSafeVendorImports` walks each vendor entry's
   closure inside the vendor dir and demotes unsafe entries to bundling,
   including closures carrying page-only code (the dynamic-base expression or
   Vite's preload helper). On
   the real production vendor this demoted bare `document-model` (entangled
   through shared chunks) while keeping the zod family shared - the naive
   plan would have shipped a dead worker.

4. **Dev serves a lazily built self-contained bundle** at the same stable
   path, instead of rewriting against dev import-map URLs: the dev vendor is
   opt-in (`PH_CONNECT_EXTERNALIZE_VENDOR=1`) and often absent, and dev does
   not need cache sharing. The tab's `worker-meta.json` fetch waits for the
   lazy build.

5. **Tab-side resolution is a probe, not config.** The tab GETs
   `<base>__reactor_worker__/worker-meta.json` and requires a JSON content
   type (an SPA fallback answers 200 with HTML). Without a bundle, the
   monorepo app falls back to its `import.meta.url` path and a packaged dist
   reports the worker unavailable. No new runtime-config field.

6. **E2E ran via playwright-cli against a static serve of the bundle**
   (ping/hello/RPC round-trip, both modes, two-tab sharing) rather than a
   scaffolded ph-cli fixture project - the worktree packages are unpublished,
   so `ph connect` cannot consume them yet. A CI fixture (plus the
   cache-sharing network assertion and reload-convergence integration check)
   is the natural follow-up once the packages are linkable.

7. **First consumer run (distyra-test, linked via `link:`) surfaced two
   hardening fixes.** The bare-specifier guard scanned raw text, and the dev
   bundle was unminified — so JSDoc code samples in kysely/viem (`import { sql }
   from 'kysely'` inside comments) read as bare imports and failed every dev
   build. The bundle is now always minified (comments stripped; sourcemaps
   carry debugging), and the guard documents that expectation. Separately, the
   build subprocess now runs builder-tools' own vite (argv-passed, project
   fallback) instead of the project's: a consumer can pin an older
   vite/rolldown via overrides (distyra-test pins 8.0.14/1.0.2) whose bundler
   semantics the build config was not written against.

8. **Pre-existing environment failures observed, not caused here:**
   builder-tools `externalize-vendor.test.ts` asserts unix execute bits after
   `chmodSync`, which Windows cannot report; ph-cli's
   `build-integration.test.ts` / `switchboard-egress.test.ts` import
   workspace dists (`codegen`, `switchboard`) that are unbuilt in a fresh
   worktree.
