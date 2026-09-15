# Connect Shared Dependencies Bundle — Design

**Issue:** powerhouse-inc/powerhouse#2359
**Date:** 2026-09-15
**Scope:** Connect runtime (browser + worker), `ph build` package builds, version compatibility checking, package-developer documentation

## Background

#2359 asks to reduce total download size by sharing common dependencies between Connect and dynamically loaded packages, extending the existing React import-map approach. Verified current state on `main` (`f3efd1664`, 2026-09-15):

- **React is already shared**, both ways: production builds self-host the React family into `dist/__react__/` and inject a page import map (`packages/builder-tools/connect-utils/vite-plugins/react-self-host.ts`); the dev server rewrites the page import map to Vite's pre-bundled React (`dev-external-react.ts`). `ph build`'s browser config externalizes the React family for the same reason (`packages/shared/clis/build-config.mts`, `neverBundle`).
- **A dev-only vendor prebuild exists.** `PH_CONNECT_EXTERNALIZE_VENDOR=1` prebuilds the heavy stable libs — `@powerhousedao/connect`, `document-model`, `zod`, `@powerhousedao/design-system/connect`, `@powerhousedao/reactor-browser`, `@powerhousedao/document-engineering` (`DEFAULT_VENDOR_INCLUDE` in `connect-utils/externalize-vendor.ts`) — into a static ESM vendor under `node_modules/.ph-vendor` with its own import map, externalizing the React family (`VENDOR_EXTERNAL`). Connect's source leaves those specifiers bare in dev; the page import map resolves them to the vendor, so Connect, the dev server, and CDN-served editor packages share one instance per realm.
- **Packages bundle everything else.** `ph build` (`clis/ph-cli/src/services/build.ts`) runs tsdown with `alwaysBundle: ["**"]` and a `neverBundle` list limited to the React family, `@powerhousedao/reactor-api`, build/test tools, and pglite. Empirically confirmed by building `test/vetra-e2e`: the emitted `dist/browser/index.js` (308 kB, gzip 58 kB) inlines its own `document-model`, `zod`, `mutative`, `change-case`, `sha1-uint8array` — the duplication the issue targets.
- **Packages load from a CDN in two realms.** Main thread: `BrowserPackageManager` imports `<cdnUrl>/<name>/browser/index.js` via dynamic `import()` (`apps/connect/src/package-manager.ts`). Opt-in Reactor SharedWorker (flag `connect.instance.reactorWorker`, default off): `WorkerPackageLoader` (`packages/reactor-browser/src/rpc/worker-package-loader.ts`) imports the same URL inside the worker. The SharedWorker is constructed **without** an import map.
- **Resolution mechanics (empirically verified, Chromium, 2026-09-15):** the page import map *does* apply to bare imports inside a dynamically imported cross-origin module (the main-thread path therefore needs no loader changes — only new map entries). The `imports` option on the `SharedWorker`/`Worker` constructor is **not supported** (absent from the WHATWG spec's `WorkerOptions`; probe confirmed the worker's module graph fails) — the worker path needs its own mechanism.
- **Class identity is load-bearing.** The package loader's subgraph detection is a prototype-chain check against the host's `@powerhousedao/reactor-api` (commented in `build-config.mts`). If packages resolve shared deps to one instance while the Connect app carries inlined copies, identities split per realm and detection breaks. The app build must use the same instances the packages resolve to.
- **The install flow already fetches each package's CDN `package.json`** (`fetchPackageJsonVersion` in `package-manager.ts`) — a natural hook for a version check. The monorepo is lockstep-versioned (all shared libs and `document-model` publish as the same version, e.g. `6.2.3-dev.8`), and `semver` is already a `@powerhousedao/shared` dependency.

## Agreed scope (2026-09-15, with Froid)

- **All three workstreams** from the issue: (a) shared dependency bundles at runtime, (b) `ph build` auto-externalization + documentation + accidental-bundling warning, (c) version compatibility checking that warns before a mismatched package installs.
- **Worker rewrite included:** packages loaded in the Reactor SharedWorker are rewritten to absolute vendor URLs (fetch → rewrite → blob import). This also fixes the latent break where any package with a bare `react` import cannot load in the worker at all.
- **Shared set v1** = the dev-vendor list minus `@powerhousedao/connect` itself, plus `@powerhousedao/reactor-api`:
  `document-model`, `zod`, `@powerhousedao/reactor-api`, `@powerhousedao/reactor-browser`, `@powerhousedao/design-system/connect`, `@powerhousedao/document-engineering`.

## What already exists (build on this, don't rebuild it)

- `connect-utils/externalize-vendor.ts` — the vendor prebuild: multi-entry `vite build` in a throwaway subprocess (handles CSS, workers, WASM; `preserveEntrySignatures: 'strict'` dedupes shared chunks), cache keyed by resolved dep versions, lock-file coordination, atomic swap. Reused for production with an `outDir` parameter.
- `connect-utils/vite-plugins/react-self-host.ts` — the production page import map (React entries). Extended with the vendor entries.
- `connect-utils/vite-plugins/dev-external-react.ts` — the dev import-map rewrite + vendor serving + externalizer wiring. The pattern is ported to build mode.
- `clis/ph-cli/src/services/build.ts` + `packages/shared/clis/build-config.mts` — the `ph build` pipeline.
- `apps/connect/src/package-manager.ts` — the install flow and its `package.json` fetch.
- `@powerhousedao/shared/registry/` — home of pure, browser-safe registry helpers (`updates.ts` from the #2357 workstream is the style precedent).

## Design

### 1. One canonical shared list (shared)

New module `packages/shared/connect/shared-deps.ts` — pure TS, no Node imports (the Connect SPA imports `shared` directly). Single source of truth consumed by the dev vendor include, the production vendor build, the page import map, `ph build`, and the version check:

```ts
export const SHARED_DEPS: readonly { specifier: string; package: string }[] = [
  { specifier: "document-model", package: "document-model" },
  { specifier: "zod", package: "zod" },
  { specifier: "@powerhousedao/reactor-api", package: "@powerhousedao/reactor-api" },
  { specifier: "@powerhousedao/reactor-browser", package: "@powerhousedao/reactor-browser" },
  { specifier: "@powerhousedao/design-system/connect", package: "@powerhousedao/design-system" },
  { specifier: "@powerhousedao/document-engineering", package: "@powerhousedao/document-engineering" },
];
```

`specifier` is the bare import used in code (subpath entries allowed — `design-system/connect`); `package` is the owning npm package (for version resolution and the check). `@powerhousedao/connect` is intentionally **not** in the set: its entry is the Connect app itself, and importing the whole app module from a package has side effects. `DEFAULT_VENDOR_INCLUDE` in `externalize-vendor.ts` becomes `[...SHARED_DEPS.specifiers, "@powerhousedao/connect"]`.

At build time, each root specifier is expanded to its browser-importable subpaths (the existing `expandIncludeSubpaths` logic in `externalize-vendor.ts`) so the import map covers `pkg` and `pkg/...` exactly as the installed version's exports map allows.

### 2. Production Connect build: self-hosted vendor

In `ph connect build` (production mode), before the app's Vite build, run the vendor prebuild with `outDir: dist/__vendor__` and include = the shared set (external = the React family, as in dev). It emits:

- one ESM entry per mapped specifier/subpath + deduped shared chunks (content-hashed, immutable-cachable);
- **`__vendor__/shared-deps.json`**: `{ "imports": { "<specifier>": "<url>" }, "versions": { "<package>": "<resolved version>" } }` — the worker's rewrite map and the host version table in one file. Served `no-cache` (its content changes per deploy).

The page import map is a single merged map: the React entries from `react-self-host.ts` plus the vendor entries (dev already merges the same way).

The vendor is **on by default** for production builds; `PH_CONNECT_VENDOR=0` opts out (in which case no `__vendor__` is emitted, the map carries only React entries, and everything behaves exactly as today).

**The app build externalizes the shared set against the vendor** — the dev-vendor pattern (`esmExternalRequirePlugin` external list extended to the shared specifiers + the bare-import externalizer + import-map injection) ported to build mode. This is a correctness requirement, not an optimization: the app's package loader must see the same `reactor-api`/`reactor-browser` class identities as the packages (prototype-chain detection). With the vendor on, the Connect app bundle shrinks by the size of those libs; they ship once, in `__vendor__`.

PWA/offline: `__vendor__/**` lives under the deploy base, so it is included in the Workbox precache (verified/extended in the plan — a missed entry would break offline package loading).

### 3. `ph build`: externalize by default, warn on accidents

- `browserBuildConfig.neverBundle` gains the shared set (subpath coverage per tsdown's matching semantics — verified in the plan, since packages import subpaths like `@powerhousedao/reactor-browser/rpc`). `nodeBuildConfig` is untouched: Node has no import maps, so switchboard-side packages keep bundling (documented).
- **Accidental-bundling warning:** after the browser build, `ph build` checks that each shared dep the project's source graph imports appears as a *bare import* in the emitted JS (not inlined). A bundled copy (possible via config override) produces a warning naming the dep. Heuristic by design — the default config makes this a no-op for well-behaved packages.
- **Per-package escape hatch:** `powerhouse.config.json` gains `sharedDeps?: Record<string, boolean>` (package name → `false` force-bundles that one dep, for authors who need a different major). `ph build` reads it and drops the entry from `neverBundle`.
- **Build-time version check:** the same pure check as §4 runs against the project's locally-resolved shared-dep versions, warning the developer before publish.
- The build output lists the externalized shared deps (one line each), so the behavior is visible.

### 4. Version compatibility checking (shared, pure)

`packages/shared/registry/shared-deps.ts` (browser-safe, `semver` already a shared dep):

```ts
export type SharedDepMismatch = {
  package: string;      // e.g. "zod"
  required: string;     // range declared by the package
  provided: string;     // host (Connect build) version
};

export function checkSharedDeps(
  pkgJson: { dependencies?: Record<string, string>; peerDependencies?: Record<string, string> },
  host: Record<string, string>, // package name -> host version
): SharedDepMismatch[];
```

- Considers each shared-set package declared in `dependencies` **or** `peerDependencies`; undeclared shared deps are not checkable and are skipped (no false positives).
- Non-semver protocols (`workspace:*`, `file:`, `link:`, `npm:`, `*`) are skipped, not treated as mismatches — monorepo packages publish with `workspace:*` rewritten, but hand-maintained packages may carry either.
- `semver.satisfies(provided, required, { includePrerelease: true })` — lockstep prerelease versions (`6.2.3-dev.8`) must compare sensibly.

**Connect consumption:** at boot the app fetches `__vendor__/shared-deps.json` once (no-op when absent — old builds, dev without vendor). The install flow's existing `package.json` fetch is extended to parse the full document; mismatches are stored per package, `console.warn`ed with a message naming each dep (`Package "@x/pkg" requires zod ^3.20, but Connect shares zod 3.19 — it may not work correctly`), and surface as a warning on the Package Manager row. **Install is not blocked** (issue: "user can still install if they choose"). The worker boot path runs the same check for boot-time packages and logs mismatches.

### 5. Worker rewrite (reactor-browser)

- New pure module `packages/reactor-browser/src/rpc/shared-dep-rewriter.ts`: `rewriteSharedImports(source: string, map: Record<string, string>): string`. Rewrites **exact** specifiers present in the map, only in import/export contexts (`import … from "x"`, `import("x")`, side-effect `import "x"`, `export … from "x"`); string literals elsewhere are never touched.
- The main thread includes `{ imports, versions }` from `shared-deps.json` in the worker's `construct` message (the main thread owns the URL base — the worker must not compute the deploy base itself; including the data also avoids a worker-side fetch). No map in the message (vendor off / dev without vendor) → `importPackage` behaves exactly as today.
- Rewritten source is imported via a **blob URL**. Guard: if the package source contains patterns that depend on `import.meta.url` for relative assets (`new URL(`), skip the rewrite for that package and import the original URL directly — the pre-existing behavior rather than silently broken asset URLs.

### 6. Dev-flow convergence

Dev keeps its opt-in behavior; `DEFAULT_VENDOR_INCLUDE` is derived from the canonical list so dev and prod can never drift. When the dev vendor is active, the main thread passes its (dev-URL-based) map in the construct message, so the worker rewrite works in dev too; when it is off, no map, no rewrite.

### 7. Documentation

New `docs/SHARED-DEPENDENCIES.md` (root `docs/`, alongside `LOCAL-REGISTRY-SETUP.md`): what is shared and why, what `ph build` does to a package (automatic externals, warnings, the `sharedDeps` escape hatch), version-check semantics, the import-map mechanics (main thread vs. worker), and the Node non-goal. Package-developer docs in the external docs repo are a follow-up, not part of this branch.

## Edge cases

- **Old (fully-bundled) packages:** unaffected. The import map only *adds* mappings; a bundle with no bare shared imports resolves identically. Rollout is gradual and backward compatible.
- **Multiple packages sharing a dep:** identical specifier → identical mapped URL → one module instance per realm, in both realms.
- **Subpath the build didn't expand** (a package imports a subpath the host's installed version doesn't export): not in the map → the main-thread import fails with a clear resolver error; the version check warns about the skew that makes this possible.
- **Incompatible range at runtime:** the package runs against the host's version; API differences are the author's risk, surfaced by the pre-install warning (the issue's accepted trade-off).
- **Non-shared heavy deps** (e.g. a package that imports `@powerhousedao/reactor`): bundled as today, still duplicated; out of scope for v1.
- **Worker without map:** exact current behavior (including today's bare-`react` limitation) — nothing regresses when the vendor is off.
- **Vendor prebuild failure** (prod): fall back to no-vendor behavior with a build warning, mirroring the dev prebuild's failure contract (build succeeds, map carries React only).

## Non-goals

- Node/switchboard-side sharing (Node has no import maps; node builds keep bundling).
- Registry server changes — the CDN serves published files unchanged.
- Modifying already-published packages or their `package.json` (peers stay as authors wrote them; the check reads, never rewrites).
- `@powerhousedao/reactor` (the ~2.5 MB core) in the shared set — deferred; it is the highest-API-surface lib and a version-mismatch risk.
- Per-user shared-dep version selection; automatic package updates.
- Manual changelog entries — release notes are produced by the release flow.

## Verification

- **Unit:** `checkSharedDeps` (range/protocol/prerelease table), `rewriteSharedImports` (each import form, string-literal safety, unknown specifiers untouched), subpath expansion, import-map merge — table-driven vitest in `shared` and `reactor-browser`.
- **Build-level:** rebuild `test/vetra-e2e` with the new `ph build` → assert its `dist/browser/index.js` carries bare imports for the shared set it uses, carries no inlined markers for them, and report the size delta against the 308 kB baseline; exercise the accidental-bundling warning and the `sharedDeps` escape hatch.
- **E2E** (the load-bearing proof, on the existing `test/vetra-e2e` Playwright + local verdaccio infra): a production Connect build with the vendor on serves `__vendor__/shared-deps.json` and the merged import map; installing the registry package via the Package Manager loads it with the shared deps resolved to the vendor (no second `document-model` in the network panel); a document opens correctly (app↔package class identity intact); a bad-range variant shows the mismatch warning and still installs; `PH_REACTOR_WORKER=1` boots with the rewritten package; the PWA precache manifest includes `__vendor__/**`. Evidence captured under `docs/superpowers/evidence/2359-shared-deps/`.
