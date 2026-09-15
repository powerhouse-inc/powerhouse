# Connect shared dependencies bundle — design

Issue: https://github.com/powerhouse-inc/powerhouse/issues/2359

Reduce total download size by sharing common dependencies between Connect and
dynamically loaded packages. Extends the existing React-via-import-map
mechanism to the other heavy, stable dependencies.

## Background (verified against the codebase, 2026-09-15)

- Each external package built by `ph build` (tsdown) bundles its own copy of
  every dependency, including `document-model`, `reactor-browser`, etc.
- Dev server: `prebuildConnectVendor` (`packages/builder-tools/connect-utils/externalize-vendor.ts`)
  prebuilds `DEFAULT_VENDOR_INCLUDE` (@powerhousedao/connect, document-model,
  zod, design-system/connect, reactor-browser, document-engineering) into a
  `__vendor__/` directory served in dev, opt-in via
  `PH_CONNECT_EXTERNALIZE_VENDOR=1`, with an import map injected by the dev
  plugin. React is handled separately
  (`dev-external-react.ts` / `react-self-host.ts`).
- Production: the Connect app is built with Vite 8 (Rolldown bundler) via
  `ph connect build` (`clis/ph-cli/src/services/connect-build.ts` →
  `getConnectBaseViteConfig` → `vite build`). Only React is shared:
  `reactSelfHostPlugin` emits the React family into `dist/__react__/` and
  injects a static `<script type="importmap">`; `esmExternalRequirePlugin`
  (a native Rolldown builtin) keeps the listed specifiers external in the app
  bundle and rewrites CJS `require()` of them into ESM imports.
- The page import map applies to the document module context, including
  dynamically imported CDN packages on the main thread. It does NOT apply in
  workers (HTML spec scopes import maps to the Window global). The reactor
  worker imports package sources with a raw `import(/* @vite-ignore */ url)`
  (`apps/connect/src/reactor.worker.ts`, `WorkerPackageLoader.importPackage`).
- The service worker precaches via Workbox glob over the dist directory
  (`packages/builder-tools/connect-utils/vite-plugins/pwa.ts` +
  `service-worker/service-worker.ts`), so additional files under
  `dist/__vendor__/` are covered automatically; no service-worker changes.
- tsdown `deps.neverBundle` is passed through verbatim to Rolldown `external`
  (verified in `tsdown@0.21.1` dist): strings are exact specifiers only,
  subpaths need separate entries or a function matcher.
- `semver` is a dependency of `@powerhousedao/shared`.
- The Package Manager UI row
  (`packages/design-system/src/connect/components/modal/settings-modal-v2/package-manager/package-manager-list.tsx`)
  already renders chips on `RegistryPackage` rows (e.g. "Update available");
  rows are fed by `useRegistryPackages` (`apps/connect/src/hooks/useRegistryPackages.ts`).
- The Connect app IS the `@powerhousedao/connect` npm package
  (`apps/connect/package.json`). Its `exports` map exposes no importable
  subpaths (root = the SPA's `dist/index.html`); the app's own
  `@powerhousedao/connect/*` imports are a tsconfig-paths alias to its source
  (`apps/connect/tsconfig.json`). No other monorepo package depends on it.

## Design

Three cooperating parts, all keyed off one canonical list.

### 1. Canonical shared list + pure helpers

New module `packages/shared/connect/shared-deps.ts`, exported from
`@powerhousedao/shared/connect`:

```ts
/** The shared dependency set: import specifier -> npm package it resolves to. */
export const SHARED_DEPS: readonly { specifier: string; package: string }[] = [
  { specifier: "document-model", package: "document-model" },
  { specifier: "@powerhousedao/document-engineering", package: "@powerhousedao/document-engineering" },
  { specifier: "@powerhousedao/shared", package: "@powerhousedao/shared" },
  { specifier: "@powerhousedao/shared/registry/urls", package: "@powerhousedao/shared" },
  { specifier: "@powerhousedao/design-system/connect", package: "@powerhousedao/design-system" },
  { specifier: "@powerhousedao/reactor-browser", package: "@powerhousedao/reactor-browser" },
];
```

`@powerhousedao/connect` is deliberately NOT in the list (see Background): it
is the Connect app itself, has no importable exports, and no monorepo
dependent — nothing to share, and externalizing it in the app build would
make the app import itself through the vendor.

Pure helpers in the same module (string-in/string-out, unit-testable):

- `parseDepSpec(spec: string): { pkg: string; sub: string | null }` — splits a
  specifier into package name + subpath.
- `findSharedImports(source: string, specs?: readonly string[]): string[]` —
  scans import/export statement positions (`from "x"`, `import "x"`,
  `import("x")`, `export … from "x"`) and returns the specifiers present that
  equal a shared specifier or extend one by subpath. Used by the build-time
  scan (source side and output side) and the install-time check.
- `rewritePackageSource(source: string, sourceUrl: string, imports: Record<string, string>): string` —
  the worker-side rewrite. Rewrites, in import/export statement positions:
  exact shared specifiers → their mapped (absolute) URL; relative specifiers
  (`./`, `../`, `#`) → absolute URLs resolved against `sourceUrl` (blob
  imports have no base, so the package's own relative imports must be made
  absolute too). Returns the input unchanged when nothing matched.
- `checkSharedDeps(pkgJson: { dependencies?, peerDependencies? }, hostVersions: Record<string, string>): SharedDepMismatch[]` —
  for every declared dep/peer range (string only; `workspace:`/`file:`/`git:`/
  `npm:`/URL protocols skipped, `*` never mismatches) that has an entry in
  `hostVersions`, `semver.satisfies(host, range, { includePrerelease: true })`
  is checked. `hostVersions` is the source of truth for the checked set —
  nothing hardcodes a list here.
- `formatSharedDepWarnings(mismatches: SharedDepMismatch[]): string[]` —
  human-readable one-liners ("requires document-model ^6.2.0; Connect provides
  6.2.3-dev.8"), used by the console output and the UI chip.

### 2. Version compatibility

The host's version table is immutable per Connect build: the vendor prebuild
emits `dist/__vendor__/shared-deps.js` — a `.js` module
(`export const imports = …; export const versions = …;`) — listing the
resolved version of every included and externalized package (shared set + the
React family). It is a real module file (not `.json`) so the Workbox precache
glob picks it up and the main thread can dynamic-import it without import
attributes. The main thread loads it once at startup (see §4).

Checked in three places, all non-blocking:

1. `ph build` — after the browser build, compare the project's declared
   ranges against the versions the Connect project (build cwd) resolves.
   Warns on mismatch so package developers hear about it at build time.
2. Package Manager row (available and installed) — chip next to the existing
   "Update available" chip, listing the mismatches; tooltip shows details.
3. Install (`PackageManager#loadPackageFromRegistry`, which already fetches
   the version's `package.json`) — `console.error` on mismatch, install
   proceeds.

### 3. Production vendor prebuild

`prebuildConnectVendor` gains parameters (existing dev call sites keep their
behavior via defaults):

```ts
type VendorPrebuildOptions = {
  dirname: string;             // existing
  include?: string[];          // default: DEFAULT_VENDOR_INCLUDE (existing dev list — unchanged)
  external?: string[];         // default: VENDOR_EXTERNAL (React family)
  vendorDir?: string;          // existing
  errorRef?: { message?: string }; // existing
  base?: string;               // NEW: URL base for the import entries (default: current VENDOR_DYNAMIC_BASE behavior)
  nodeEnv?: "development" | "production"; // NEW (default: "development")
};
// returns PrebuiltVendor = { vendorDir: string; imports: Record<string,string>; versions: Record<string,string> }

const PROD_VENDOR_INCLUDE = [...DEFAULT_VENDOR_INCLUDE,
  "@powerhousedao/shared", "@powerhousedao/shared/registry/urls"]; // the union also covers SHARED_DEPS
```

The returned `imports` map uses `base + "__vendor__/<spec>.js"` values, the
same shape as the React self-host map, so dynamic-base builds get the same
placeholder treatment (`connectDynamicBasePlugin` / the serve-time proxy both
already handle `__react__` URLs; `__vendor__` URLs flow through the same
rewrites).

`ph connect build` wiring (`connect-build.ts`):

1. Vendor prebuild into a fresh `dist/__vendor__/` (before the app build;
   enabled by default; `PH_CONNECT_VENDOR=0` disables — then no vendor map
   entries, no app externalization: current behavior).
2. Selective dist clean: remove every top-level entry of `dist/` except
   `__vendor__` (the app build then runs with `emptyOutDir: false`, or it
   would wipe the vendor output).
3. `getConnectBaseViteConfig` gains `vendor?: { imports; versions }`; when
   present and in build mode:
   - `esmExternalRequirePlugin({ external: [...reactExternal, ...vendorSpecifiers] })`
     (vendorSpecifiers = the SHARED_DEPS specifiers; the Connect app itself is
     not among them) — the app's own imports of the shared deps stay bare and
     resolve through the import map, so Connect and packages run on one copy
     of each.
   - A small build plugin merges the vendor entries into the import map that
     `reactSelfHostPlugin` injects (`transformIndexHtml` after it; parses the
     existing `<script type="importmap">` and adds the vendor entries).

Service worker: no changes. The Workbox precache glob already picks up
`dist/__vendor__/**`; `shared-deps.js` is covered by the same glob.

### 4. Connect runtime

- New `apps/connect/src/shared-deps.ts`: `getSharedDeps():
  Promise<{ imports: Record<string,string>; versions: Record<string,string> } | null>`
  — dynamic-imports `${BASE_URL}__vendor__/shared-deps.js`, resolves the
  dynamic-base placeholder in the import values against the runtime base,
  makes values absolute URLs, and fails soft (`null`) when the vendor is not
  present (dev, or `PH_CONNECT_VENDOR=0`).
- Package Manager (`useRegistryPackages` + `PackageManagerListItem`):
  `RegistryPackage` gains `sharedDepWarnings?: string[]` (type in
  `packages/shared/registry/types.ts`); the hook fills it from the fetched
  package metadata + `getSharedDeps().versions`; the row renders a warning
  chip when non-empty.
- Worker: `WorkerPackageLoaderOptions` gains `sharedImports?:
  Record<string,string>` (absolute URLs) and an optional
  `importSource?: (source: string) => Promise<Record<string, unknown>>`.
  `loadPackage`: when `sharedImports` is non-empty, fetch the package source,
  run `rewritePackageSource`, and import the result via `importSource` when
  anything was rewritten (blob URL import provided by the worker); otherwise
  the existing `importPackage(url)` path is used untouched, so packages built
  without shared deps behave exactly as today. The worker's construct message
  (`WorkerConstruct` in `reactor.worker.ts`) carries the import map from the
  main thread's `getSharedDeps()`.

### 5. Package build

- `packages/builder-tools/shared/build-config.mts`: `browserBuildConfig`
  becomes `buildBrowserBuildConfig(options?: { sharedDeps?: boolean })`
  (default `true`), returning the existing base config plus — when enabled —
  a `deps.neverBundle` function matcher externalizing each shared specifier
  exactly or by subpath, in addition to the existing string entries (the
  matcher subsumes them; React stays as-is).
- `ph build` (`clis/ph-cli/src/services/build.ts`): flag
  `--no-shared-deps` disables (default on). After the browser tsdown build, a
  post-build scan: for each shared spec the project's source entries import
  (`findSharedImports` over the source files), verify the emitted
  `dist/browser/**` output still contains a bare import of that spec; if not,
  it was bundled — warn with the offending spec(s). The scan is advisory (a
  warning, not a failure): a package may legitimately bundle one copy.
- `apps/vetra-packages/tsdown.config.ts` switches to the factory call
  (vetra builds through the same config object).
- Install-time requirement check: at install, the fetched main bundle is
  scanned with `findSharedImports`; when the host has no vendor (no import
  map entries for those specs) the bare imports would be unresolvable at load
  time — `console.error` before that happens.

## Compatibility matrix

| Package built … | Host … | Result |
|---|---|---|
| without shared deps (existing) | vendor on | Unchanged; no benefit, no break. |
| without shared deps (existing) | vendor off | Unchanged. |
| with shared deps | vendor on, versions compatible | Shared copies; minimal download. |
| with shared deps | vendor on, versions mismatched | Works (host copy used); warned at build, in PM UI, and at install. |
| with shared deps | vendor off | Bare imports unresolvable; the install-time scan warns before this can happen. |

## Docs

- `docs/SHARED-DEPENDENCIES.md` — package-developer guide: what is shared, how
  to verify your build externalized correctly (the build warning), the
  `--no-shared-deps` escape hatch, version compatibility rules, and the
  worker import-map behavior.
- ADR `docs/adr/0003-*.md` recording the decision (repo ADR format).

## Success criteria (from the issue)

- [ ] Common dependencies are not duplicated in package downloads.
- [ ] `ph build` externalizes them by default.
- [ ] A version mismatch is warned before a package is installed.
- [ ] Offline/dynamic-base behavior of Connect is unchanged (vendor files
  ride the existing precache glob and base handling).
