# Connect Shared Dependencies Bundle — Implementation Plan

Issue: https://github.com/powerhouse-inc/powerhouse/issues/2359
Spec: `docs/superpowers/specs/2026-09-15-connect-shared-deps-design.md`
Branch: `chore/2359-shared-deps-bundle` (worktree
`~/.worktrees/powerhouse/2359-shared-deps-bundle`, already built)

Conventions: TDD (write the failing test first, then the code) per task; one
commit per task; run the task's verification before committing. The worktree
was created with `scripts/new-worktree.sh` so `pnpm build` + `pnpm tsc` are
current. Skip formatters/linters mid-flight; run repo-wide checks in the
final verification task.

## File map

| File | Change |
|---|---|
| `packages/shared/connect/shared-deps.ts` | NEW: canonical list + pure helpers |
| `packages/shared/connect/index.ts` | export the new module |
| `packages/shared/connect/shared-deps.test.ts` | NEW: tests for all helpers |
| `packages/shared/registry/types.ts` | `RegistryPackage.sharedDepWarnings?` |
| `packages/builder-tools/connect-utils/externalize-vendor.ts` | `base`/`nodeEnv` options, versions, `shared-deps.js` emission |
| `packages/builder-tools/connect-utils/externalize-vendor.test.ts` | NEW: versions + module emission |
| `packages/builder-tools/connect-utils/vite-plugins/vendor-import-map.ts` | NEW: build plugin merging vendor entries into the import map |
| `packages/builder-tools/connect-utils/vite-config.ts` | `IConnectOptions.vendor`, app externalization wiring |
| `packages/builder-tools/connect-utils/index.ts` | export the new plugin |
| `clis/ph-cli/src/services/connect-build.ts` | production vendor flow + selective clean |
| `packages/shared/clis/build-config.mts` | `browserBuildConfig` → `buildBrowserBuildConfig()` factory |
| `packages/shared/clis/args/common.ts` | `noSharedDeps` flag on `buildArgs` |
| `clis/ph-cli/src/services/build.ts` | factory call + post-build scan + version check |
| `packages/vetra-packages/tsdown.config.ts` | factory call |
| `packages/reactor-browser/src/rpc/worker-package-loader.ts` | `sharedImports`/`importSource` options, rewrite + blob import |
| `apps/connect/src/reactor.worker.ts` | `WorkerConstruct.sharedImports`, blob `importSource` |
| `apps/connect/src/shared-deps.ts` | NEW: `getSharedDeps()` |
| `apps/connect/src/reactor-worker-client.ts` | `sharedImports` arg + message field |
| `apps/connect/src/package-manager.ts` | install-time version check |
| `apps/connect/src/hooks/useRegistryPackages.ts` | fill `sharedDepWarnings` |
| `packages/design-system/src/connect/components/modal/settings-modal-v2/package-manager/package-manager-list.tsx` | warning chip |
| `docs/SHARED-DEPENDENCIES.md` | NEW: package-developer guide |
| `docs/adr/0003-connect-shared-deps.md` | NEW: ADR (repo ADR format) |

---

## Task 1 — Canonical shared list + pure helpers

**Files:** `packages/shared/connect/shared-deps.ts` (new),
`packages/shared/connect/index.ts`, `packages/shared/connect/shared-deps.test.ts` (new)

`@powerhousedao/shared` already depends on `semver`. Add the module:

```ts
import { satisfies, validRange } from "semver";

export type SharedDep = { specifier: string; package: string };

/**
 * The dependency set Connect and loaded packages share via the import map.
 * `@powerhousedao/connect` is deliberately absent: it is the Connect app
 * itself (no importable exports), so there is nothing to share.
 */
export const SHARED_DEPS: readonly SharedDep[] = [
  { specifier: "document-model", package: "document-model" },
  { specifier: "@powerhousedao/document-engineering", package: "@powerhousedao/document-engineering" },
  { specifier: "@powerhousedao/shared", package: "@powerhousedao/shared" },
  { specifier: "@powerhousedao/shared/registry/urls", package: "@powerhousedao/shared" },
  { specifier: "@powerhousedao/design-system/connect", package: "@powerhousedao/design-system" },
  { specifier: "@powerhousedao/reactor-browser", package: "@powerhousedao/reactor-browser" },
];

export const SHARED_DEP_SPECIFIERS: readonly string[] = SHARED_DEPS.map(
  (d) => d.specifier,
);

/** Split a specifier into its package name and subpath ("" for a root). */
export function parseDepSpec(spec: string): { pkg: string; sub: string } {
  if (spec.startsWith("@")) {
    const parts = spec.split("/");
    return { pkg: parts.slice(0, 2).join("/"), sub: parts.slice(2).join("/") };
  }
  const i = spec.indexOf("/");
  return i === -1
    ? { pkg: spec, sub: "" }
    : { pkg: spec.slice(0, i), sub: spec.slice(i + 1) };
}
```

`findSharedImports` — scan import/export statement positions only. Three
regexes cover every static position: `… from "x"`, `import "x"` (side
effect), `import("x")` (dynamic). `export … from "x"` contains `from "x"` so
the first regex covers it.

```ts
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function isSharedSpecifier(spec: string, specs: readonly string[]): boolean {
  return specs.some((s) => spec === s || spec.startsWith(s + "/"));
}

/**
 * Return the import/export specifiers in `source` that are a shared
 * specifier (or a subpath of one). Only statement positions are scanned:
 * `from "x"`, `import "x"`, `import("x")`.
 */
export function findSharedImports(
  source: string,
  specs: readonly string[] = SHARED_DEP_SPECIFIERS,
): string[] {
  const found = new Set<string>();
  const patterns = [
    /\bfrom\s+["']([^"'\\]+)["']/g,
    /\bimport\s+["']([^"'\\]+)["']/g,
    /\bimport\s*\(\s*["']([^"'\\]+)["']\s*\)/g,
  ];
  for (const re of patterns) {
    for (const m of source.matchAll(re)) {
      const spec = m[1];
      if (isSharedSpecifier(spec, specs)) found.add(spec);
    }
  }
  return [...found];
}
```

`rewritePackageSource` — the worker-side rewrite (spec §1). Shared specifiers
→ their mapped URL; relative/`#` specifiers → absolute against `sourceUrl`
(blob imports have no base). Returns the input unchanged when nothing
matched, so callers can skip the blob import for unrewritten sources.

```ts
export function rewritePackageSource(
  source: string,
  sourceUrl: string,
  imports: Record<string, string>,
): string {
  if (!Object.keys(imports).length) return source;
  const base = new URL(sourceUrl);
  const map = (spec: string): string | null => {
    const mapped = imports[spec];
    if (mapped) return mapped;
    if (
      spec.startsWith("./") ||
      spec.startsWith("../") ||
      spec.startsWith("#")
    ) {
      return new URL(spec, base).href;
    }
    return null;
  };
  let out = source;
  for (const re of [
    /\bfrom\s+["']([^"'\\]+)["']/g,
    /\bimport\s+["']([^"'\\]+)["']/g,
    /\bimport\s*\(\s*["']([^"'\\]+)["']\s*\)/g,
  ]) {
    out = out.replace(re, (match, spec: string) => {
      // The match contains the quoted specifier exactly once and the
      // captured group has no quotes/backslashes ([^"'\\]), so a literal
      // replace is safe.
      const mapped = map(spec);
      return mapped ? match.replace(`"${spec}"`, `"${mapped}"`) : match;
    });
  }
  return out;
}
```

`checkSharedDeps` + `formatSharedDepWarnings` (spec §2):

```ts
export type SharedDepMismatch = {
  package: string;
  required: string;
  provided: string;
};

export type PackageDeps = {
  dependencies?: Record<string, unknown>;
  peerDependencies?: Record<string, unknown>;
};

/**
 * Compare a package's declared ranges against the host's version table.
 * `hostVersions` defines the checked set (only deps present in it are
 * checked). Non-semver protocols (workspace:, file:, git:, npm:, URLs) and
 * `*` never mismatch.
 */
export function checkSharedDeps(
  pkgJson: PackageDeps,
  hostVersions: Record<string, string>,
): SharedDepMismatch[] {
  const out: SharedDepMismatch[] = [];
  const entries = [
    ...Object.entries(pkgJson.dependencies ?? {}),
    ...Object.entries(pkgJson.peerDependencies ?? {}),
  ];
  for (const [dep, range] of entries) {
    const provided = hostVersions[dep];
    if (provided === undefined || typeof range !== "string") continue;
    if (range === "*" || /^[a-z]+:/i.test(range)) continue;
    if (!validRange(range)) continue;
    if (!satisfies(provided, range, { includePrerelease: true })) {
      out.push({ package: dep, required: range, provided });
    }
  }
  return out;
}

export function formatSharedDepWarnings(
  mismatches: SharedDepMismatch[],
): string[] {
  return mismatches.map(
    (m) =>
      `${m.package}: requires ${m.required}, Connect provides ${m.provided}`,
  );
}
```

`packages/shared/connect/index.ts` — append:
`export * from "./shared-deps.js";`

**Tests** (`shared-deps.test.ts`, vitest, table-driven):
- `parseDepSpec`: `document-model` → `{pkg: "document-model", sub: ""}`;
  `@powerhousedao/shared/registry/urls` →
  `{pkg: "@powerhousedao/shared", sub: "registry/urls"}`.
- `findSharedImports`: finds `import {x} from "document-model"`,
  `import "document-model"`, `import("@powerhousedao/shared/registry/urls")`,
  `export * from "@powerhousedao/reactor-browser/rpc"` (subpath of a shared
  root is reported as-is); does NOT find `document-model` inside a string
  literal that is not an import position (e.g.
  `const s = "document-model"`), nor non-shared specifiers.
- `rewritePackageSource`: shared specifier → mapped URL; `./foo` and
  `../bar` → absolute URLs against `sourceUrl`; non-shared bare specifiers
  untouched; source with no matches returned byte-identical (same reference
  acceptable, assert `=== source`).
- `checkSharedDeps`: `^6.2.0` vs host `6.2.3-dev.8` → no mismatch
  (includePrerelease); `^3.20` vs `3.19.1` → mismatch; `*` → never;
  `workspace:*` → never; dep absent from hostVersions → never; invalid
  range string → never; peerDependencies checked like dependencies.
- `formatSharedDepWarnings`: one line per mismatch with package/range/version.

**Verify:** `pnpm --filter @powerhousedao/shared test` (or repo-root
`pnpm vitest run packages/shared/connect/shared-deps.test.ts`) then
`pnpm tsc` (worktree root — or the shared package's tsc project).

**Commit:** `feat(shared): canonical shared-deps list + pure import/version helpers (#2359)`

---

## Task 2 — `RegistryPackage.sharedDepWarnings`

**Files:** `packages/shared/registry/types.ts`

```ts
export type RegistryPackage = PackageInfo & {
  status: RegistryPackageStatus;
  /** Shared-dependency version mismatches, pre-formatted (see formatSharedDepWarnings). */
  sharedDepWarnings?: string[];
};
```

No test needed (type-only); verify with `pnpm tsc`.
**Commit:** `feat(shared): RegistryPackage gains sharedDepWarnings (#2359)`

---

## Task 3 — `prebuildConnectVendor`: base, nodeEnv, versions, shared-deps.js

**Files:** `packages/builder-tools/connect-utils/externalize-vendor.ts`,
new `externalize-vendor.test.ts`

Current shape (verified): options `{dirname, include?, external?, vendorDir?,
errorRef?}`; worker subprocess argv
`[workerPath, dirname, outDir, includeJSON, urlPrefix, externalJSON, VENDOR_DYNAMIC_BASE, selfModulePath]`;
cache via `vendorDir/import-map.json` (`VendorCacheMeta`);
`resolveVersionDigest(dirname, specs)` builds the digest from per-package
versions.

Changes:

1. Options:
```ts
export interface VendorPrebuildOptions {
  dirname: string;
  include?: string[];
  external?: string[];
  vendorDir?: string;
  errorRef?: { message?: string };
  /** URL base for the import entries. Default: the dev VENDOR_DYNAMIC_BASE placeholder. */
  base?: string;
  /** NODE_ENV for the vendor build. Default: "development". */
  nodeEnv?: "development" | "production";
}
export interface PrebuiltVendor {
  vendorDir: string;
  imports: Record<string, string>;
  /** Resolved versions of every included + external package. */
  versions: Record<string, string>;
}
```
2. Extract `resolveDepVersions(dirname: string, specs: string[]): Record<string, string>`
   from `resolveVersionDigest` (same per-package package.json read; the
   digest function then hashes that map + the worker hash — behavior
   unchanged).
3. `runBuildWorker` gains `base` and `nodeEnv` args appended to argv after
   `selfModulePath`; the worker reads
   `const [dirname, vendorDir, includeJSON, urlPrefix, externalJSON, dynamicBase, selfModulePath, baseArg, nodeEnvArg]`
   and uses `base = baseArg ?? dynamicBase`, `nodeEnv = nodeEnvArg ?? "development"`
   (pass `NODE_ENV` through the spawn env and/or the worker's vite
   `mode` so the emitted code is a production build when requested).
4. `buildVendorAtomic` also receives `versions`; after the atomic swap it
   writes `${vendorDir}/shared-deps.js`:
```js
export const imports = <JSON>;
export const versions = <JSON>;
```
   The `VendorCacheMeta` gains `versions?`; `readCacheHit` returns
   `{ imports, versions }` (fall back to recomputing `versions` from the
   cache meta on a hit) so every return path of `prebuildConnectVendor`
   yields a `PrebuiltVendor` with both fields.
5. Dev call site (`dev-external-react.ts`) untouched — it omits `base`/
   `nodeEnv`, keeping dev byte-identical.

**Tests** (`externalize-vendor.test.ts`): build a tmp project fixture
(`node_modules` with a couple of trivial packages with distinct versions):
- `prebuildConnectVendor({dirname, include: [fixturePkg], base: "/app/"})`
  → returned `imports` values start with `/app/__vendor__/`;
  `shared-deps.js` exists in vendorDir and parses as a module whose
  `imports`/`versions` exports match the returned object (import it with
  dynamic `import` in the test — it's plain ESM).
- `nodeEnv: "production"` build succeeds (smoke: process exits 0; assert
  the emitted entry file does not contain development-only banners if the
  fixture package has any — otherwise just assert success).
- Dev defaults: `prebuildConnectVendor({dirname, include: [...]})` with no
  base/nodeEnv → import-map values use the `VENDOR_DYNAMIC_BASE` placeholder
  (unchanged behavior).

**Verify:** `pnpm vitest run packages/builder-tools/connect-utils/externalize-vendor.test.ts`
+ `pnpm tsc`.
**Commit:** `feat(builder-tools): vendor prebuild gains base/nodeEnv/versions + shared-deps.js (#2359)`

---

## Task 4 — Connect app build: import map merge + app externalization

**Files:** `packages/builder-tools/connect-utils/vite-plugins/vendor-import-map.ts`
(new), `packages/builder-tools/connect-utils/vite-config.ts`,
`packages/builder-tools/connect-utils/index.ts`, test
`packages/builder-tools/connect-utils/vite-plugins/vendor-import-map.test.ts`

New plugin (build-only; registered AFTER `reactSelfHostPlugin` so its
`transformIndexHtml` runs after the map is injected):

```ts
import type { HtmlTag, Plugin } from "vite";

export type VendorImportMapOptions = {
  /** bare specifier -> URL (already base-prefixed by the caller). */
  imports: Record<string, string>;
};

/**
 * Merge the production vendor's entries into the `<script type="importmap">`
 * that reactSelfHostPlugin injects. Build-only; no-op when the map is
 * absent or has no entries.
 */
export function vendorImportMapPlugin(options: VendorImportMapOptions): Plugin {
  return {
    name: "ph-vendor-import-map",
    apply: "build",
    transformIndexHtml(_html, ctx) {
      // `ctx.html` is a string in the HTML form; after an earlier plugin
      // returned tag descriptors it is HtmlTag[]. Handle both.
      ...
    },
  };
}
```

Implementation: locate the `script[type=importmap]` tag (string: regex
`<script type="importmap">([\s\S]*?)</script>`; array: the tag with
`attrs.type === "importmap"`), parse its JSON children, merge
`options.imports` into `imports`, re-serialize. If no import map exists
(reactSelfHost absent — e.g. a consumer that disabled it), inject one.

`vite-config.ts`:
- `IConnectOptions` +=
  `vendor?: { imports: Record<string,string>; versions: Record<string,string> }`
- In the plugins array, after `reactSelfHostPlugin(...)`:
```ts
...(options.vendor && mode === "production"
  ? [vendorImportMapPlugin({ imports: options.vendor.imports })]
  : []),
```
- The existing `esmExternalRequirePlugin({ external: reactExternal })`
  becomes `esmExternalRequirePlugin({ external: [...reactExternal, ...(options.vendor && mode === "production" ? SHARED_DEP_SPECIFIERS : [])] })`
  — `SHARED_DEP_SPECIFIERS` imported from `@powerhousedao/shared/connect`
  (builder-tools already depends on shared). The Connect app itself is not in
  the list, so its self-imports (tsconfig-paths aliases) are unaffected.

**Tests** (`vendor-import-map.test.ts`): call the plugin's
`transformIndexHtml` hook with (a) an HtmlTag[] containing a react map
`{"imports":{"react":"/__react__/react.js"}}` → merged output contains both
react and the vendor entries; (b) a plain string html with an inline import
map script → merged; (c) html with no import map → one is injected.
**Verify:** `pnpm vitest run packages/builder-tools/connect-utils/vite-plugins/vendor-import-map.test.ts` + `pnpm tsc`.
**Commit:** `feat(builder-tools): connect build externalizes shared deps into the import map (#2359)`

---

## Task 5 — `ph connect build`: production vendor flow

**Files:** `clis/ph-cli/src/services/connect-build.ts`

Current flow (verified): `runBuild(args)` (project's local packages) →
`getConnectBaseViteConfig({dirname, outDir?, mode, ...})` →
`mergeConfig(baseConfig, {build: {outDir}})` → `build(config)`; plus
`checkLocalPackagesInstalled`.

Changes:
1. Vendor on by default; disabled by `PH_CONNECT_VENDOR=0|false`:
```ts
const vendorEnabled =
  (process.env.PH_CONNECT_VENDOR ?? "1") !== "0" &&
  (process.env.PH_CONNECT_VENDOR ?? "1") !== "false";
```
2. When enabled, before the app build:
```ts
import { prebuildConnectVendor, VENDOR_URL_PREFIX } from "@powerhousedao/builder-tools";
import { SHARED_DEPS } from "@powerhousedao/shared/connect";
// include = DEFAULT_VENDOR_INCLUDE ∪ SHARED_DEPS specifiers ∪ the
// @powerhousedao/shared subpaths (SHARED_SUBPATHS). The bare shared root is
// excluded: its type barrel references node-only modules (clis/), which the
// current vite/rolldown cannot bundle for the browser — vendoring the root
// fails the build (pre-existing latent issue, surfaced by this work).
const vendor = await prebuildConnectVendor({
  dirname,
  include: [
    ...new Set([
      ...DEFAULT_VENDOR_INCLUDE,
      ...SHARED_DEP_SPECIFIERS.filter((s) => s !== "@powerhousedao/shared"),
      ...SHARED_SUBPATHS.map((s) => `@powerhousedao/shared/${s}`),
    ]),
  ],
  vendorDir: join(outDirAbs, "__vendor__"),
  base: <the same base string the app build uses (options.dynamicBase ? DYNAMIC_BASE_PLACEHOLDER : basePathOrRoot)>,
  nodeEnv: "production",
  errorRef,
});
```
   On `null` result: `console.error` the cause and fail the build (production
   builds must not ship a broken half-state; dev's soft fallback stays in the
   dev plugin).
3. Selective clean before the app build: remove every top-level entry of
   `dist/` except `__vendor__` (small helper `cleanDistExcept(dist, keep)`),
   then add `emptyOutDir: false` to the merged build config (otherwise vite
   wipes the vendor dir).
4. Pass `vendor: vendor ? { imports: vendor.imports, versions: vendor.versions } : undefined`
   to `getConnectBaseViteConfig`.

**Tests:** unit-test the two pure-ish pieces: `cleanDistExcept` (tmp dir
fixture: keeps `__vendor__`, removes others) — put it in a new
`clis/ph-cli/src/services/connect-build.test.ts`. The env-flag parsing is a
one-liner; cover it with a small exported predicate `isVendorEnabled(env)`.
**Verify:** `pnpm vitest run clis/ph-cli/src/services/connect-build.test.ts` + `pnpm tsc`.
**Commit:** `feat(ph-cli): ph connect build prebuilds the production vendor (#2359)`

---

## Task 6 — `ph build`: factory config, flag, post-build scan, vetra

**Files:** `packages/shared/clis/build-config.mts`,
`packages/shared/clis/args/common.ts`, `clis/ph-cli/src/services/build.ts`,
`packages/vetra-packages/tsdown.config.ts`, new
`packages/shared/clis/build-config.test.ts`.

1. `build-config.mts`: keep the existing object as the default; add the
   factory:
```ts
import { SHARED_DEP_SPECIFIERS } from "../connect/shared-deps.js"; // same package (relative import)

const sharedNeverBundle = (
  id: string,
): boolean => SHARED_DEP_SPECIFIERS.some(
  (s) => id === s || id.startsWith(s + "/"),
);

export type BrowserBuildConfigOptions = {
  /** Externalize the shared dependency set (default true). */
  sharedDeps?: boolean;
};

export function buildBrowserBuildConfig(
  options: BrowserBuildConfigOptions = {},
): InlineConfig {
  const sharedDeps = options.sharedDeps ?? true;
  return {
    ...baseBrowserConfig,
    deps: {
      alwaysBundle: ["**"],
      neverBundle: [
        ...nodeNeverBundle,
        ...(sharedDeps ? [sharedNeverBundle] : []),
      ],
    },
  };
}

// Kept for existing callers: the default (shared deps externalized).
export const browserBuildConfig = buildBrowserBuildConfig();
```
   (Refactor the current `browserBuildConfig` body into `baseBrowserConfig`
   minus its `deps.neverBundle`/plugins; the React entries and
   `esmExternalRequirePlugin` stay in the base — a function entry and string
   entries may coexist in `neverBundle`, which is passed verbatim to
   rolldown `external`.)
2. `args/common.ts` `buildArgs`:
```ts
noSharedDeps: flag({
  type: boolean,
  long: "no-shared-deps",
  description: "Bundle the shared dependency set instead of externalizing it (default: externalize)",
  defaultValue: () => false as const,
  defaultValueIsSerializable: true,
}),
```
3. `services/build.ts` `runBuild`:
```ts
const sharedDeps = !args.noSharedDeps;
await tsdownBuild({
  ...buildBrowserBuildConfig({ sharedDeps }),
  outDir: join(outDir, "browser"),
});
// after the browser build (only when sharedDeps): post-build scan
if (sharedDeps) {
  const sourceEntries = browserEntry; // same entry list as the config
  const imported = findSharedImportsInSources(process.cwd(), sourceEntries);
  const bundled = findBundledSharedDeps(imported, readDistBrowserFiles(join(outDir, "browser")));
  if (bundled.length) {
    console.warn(`⚠ shared deps bundled instead of externalized: ${bundled.join(", ")} — check your neverBundle config`);
  }
}
```
   with two small pure helpers in the shared module:
```ts
export function findBundledSharedDeps(
  importedSpecs: string[],
  outputs: readonly { path: string; content: string }[],
): string[] {
  // a spec is "bundled" when the output no longer references it as a bare
  // import (the bundler inlined it)
  return importedSpecs.filter(
    (spec) => !outputs.some((f) => findSharedImports(f.content, [spec]).includes(spec)),
  );
}
```
   (`findSharedImportsInSources`/`readDistBrowserFiles` live in the service —
   fs glue, not exported.)
4. `packages/vetra-packages/tsdown.config.ts`: replace the `browserBuildConfig`
   import/usage with `buildBrowserBuildConfig()` (same default behavior now
   includes the shared set — this is the intended change for vetra).

**Tests** (`build-config.test.ts`):
- `buildBrowserBuildConfig()` (default) — `deps.neverBundle` contains a
  function; calling it with `"document-model"`,
  `"@powerhousedao/reactor-browser/rpc"` (subpath) → true; with
  `"react"` → false (react stays handled by the existing strings); with
  `"@powerhousedao/connect/utils"` → false (not shared).
- `buildBrowserBuildConfig({ sharedDeps: false })` — the matcher is absent
  from neverBundle; the rest of the config is deep-equal to the previous
  `browserBuildConfig` default (assert the react strings are still present).
- `findBundledSharedDeps`: output containing `from "document-model"` → not
  bundled; output without it (but with the code inlined) → reported.
**Verify:** `pnpm vitest run packages/shared/clis/build-config.test.ts` + `pnpm tsc`.
**Commit:** `feat(shared): ph build externalizes shared deps by default + post-build scan (#2359)`

---

## Task 7 — Worker package loading: shared import rewrite

**Files:** `packages/reactor-browser/src/rpc/worker-package-loader.ts`,
`packages/reactor-browser/src/rpc/index.ts` (if new types need re-export),
test next to the loader.

```ts
export type WorkerPackageLoaderOptions = {
  cdnUrl: string;
  importPackage: PackageImporter;
  resolvePackages?: (documentType: string) => Promise<string[]>;
  /** Absolute-URL import map for shared deps (worker import maps don't
   *  exist, so the source is rewritten to these URLs and blob-imported). */
  sharedImports?: Record<string, string>;
  /** Import a rewritten source string (blob URL). Only called when a
   *  rewrite happened; omit to disable shared-deps loading in a worker. */
  importSource?: (source: string) => Promise<Record<string, unknown>>;
};
```

In `loadPackage(spec)`: currently `const mod = await this.importPackage(url)`.
New:
```ts
let mod: Record<string, unknown>;
const source = this.sharedImports && Object.keys(this.sharedImports).length
  ? await (await fetch(url)).text()
  : undefined;
const rewritten = source !== undefined
  ? rewritePackageSource(source, url, this.sharedImports!)
  : source;
if (rewritten !== undefined && rewritten !== source) {
  if (!this.importSource) throw new Error("importSource is required for shared-deps packages");
  mod = await this.importSource(rewritten);
} else {
  mod = await this.importPackage(url);
}
```
(Keep the existing failure handling — wrap in the same try/catch that
records `PackageLoadFailure`.)

**Tests:** stub `importPackage`/`importSource`/`fetch` (vitest `vi.stubGlobal`
for fetch):
- package source with `import "document-model"` + `sharedImports` mapping →
  `importSource` called with the rewritten source (assert the mapped URL is
  present, relative `./x` became absolute against the CDN url);
  `importPackage` NOT called.
- package source with no shared/relative imports → `importPackage` called
  with the raw url; `importSource` not called; `sharedImports` present but
  unused.
- no `sharedImports` at all → exactly the old behavior (`importPackage` only).
- missing `importSource` with a rewritable source → throws (surfaced as a
  load failure).
**Verify:** `pnpm vitest run packages/reactor-browser/src/rpc/worker-package-loader.test.ts` + `pnpm tsc`.
**Commit:** `feat(reactor-browser): worker loader rewrites shared imports for blob import (#2359)`

---

## Task 8 — Connect app: `getSharedDeps()` + worker wiring

**Files:** `apps/connect/src/shared-deps.ts` (new),
`apps/connect/src/reactor.worker.ts`,
`apps/connect/src/reactor-worker-client.ts`, the caller that creates the
worker client (grep `createWorkerReactorClientModule` — thread the new arg
through that single call site).

`shared-deps.ts`:
```ts
import { DYNAMIC_BASE_PLACEHOLDER } from "@powerhousedao/builder-tools";

export type SharedDeps = {
  imports: Record<string, string>;
  versions: Record<string, string>;
};

let cached: Promise<SharedDeps | null> | null = null;

/**
 * The production vendor's shared-deps module. Values are normalized to
 * absolute URLs (the dynamic-base placeholder resolved against the runtime
 * base) so they can be sent to the worker, whose import has no document
 * context. Resolves null when the vendor is absent (dev / vendor-off
 * builds) — callers treat that as "no sharing".
 */
export function getSharedDeps(): Promise<SharedDeps | null> {
  cached ??= (async () => {
    try {
      const mod = await import(
        /* @vite-ignore */ `${import.meta.env.BASE_URL}__vendor__/shared-deps.js`
      );
      const base =
        (globalThis as { __PH_DYNAMIC_BASE__?: string }).__PH_DYNAMIC_BASE__ ||
        import.meta.env.BASE_URL;
      const imports = Object.fromEntries(
        Object.entries(mod.imports).map(([k, v]) => [
          k,
          new URL(v.replace(DYNAMIC_BASE_PLACEHOLDER, base), window.location.origin).href,
        ]),
      );
      return { imports, versions: mod.versions };
    } catch {
      return null;
    }
  })();
  return cached;
}
```
(If `DYNAMIC_BASE_PLACEHOLDER` isn't exported from the builder-tools index,
import it from the module that defines it, or compare against the literal
`/__PH_DYNAMIC_BASE__/` — check the export and use the constant.)

`reactor-worker-client.ts`: `WorkerReactorClientArgs` +=
`sharedImports?: Record<string, string>`; the construct message (the
`cdnUrl:` / `packageSpecs:` block) += `sharedImports: args.sharedImports`.

`reactor.worker.ts`: `WorkerConstruct` +=
`sharedImports?: Record<string, string>`; loader construction:
```ts
loader = new WorkerPackageLoader({
  cdnUrl: construct.cdnUrl,
  importPackage: (url) => import(/* @vite-ignore */ url),
  sharedImports: construct.sharedImports,
  importSource: (source) =>
    import(/* @vite-ignore */ URL.createObjectURL(new Blob([source], { type: "text/javascript" }))),
});
```

The call site of `createWorkerReactorClientModule` (find it via grep — it's
in the app's reactor store/service) gets
`sharedImports: (await getSharedDeps())?.imports` (await once at worker
creation; the function caches).

**Tests:** `apps/connect/src/shared-deps.test.ts` — stub the dynamic import
(vitest `vi.mock` of the computed specifier is awkward for a template
literal; instead split the pure normalization out:
`normalizeVendorImports(rawImports, baseUrl)` exported from the same module
and tested: placeholder replaced with the runtime base, values made
absolute; a non-placeholder base passes through). The worker/client wiring
is covered by Task 10's E2E.
**Verify:** `pnpm vitest run apps/connect/src/shared-deps.test.ts` + `pnpm tsc` (apps/connect).
**Commit:** `feat(connect): load the vendor shared-deps table and wire it into the worker (#2359)`

---

## Task 9 — Package Manager: version warnings (UI + install)

**Files:** `apps/connect/src/hooks/useRegistryPackages.ts`,
`packages/design-system/.../package-manager/package-manager-list.tsx`,
`apps/connect/src/package-manager.ts`.

1. `useRegistryPackages`: when a row's package.json is known (installed rows:
   from the package manager's stored package; available rows: the fetched
   `PackageInfo`/package.json for the selected version — reuse the existing
   fetch the row already triggers for version metadata), compute
   `sharedDepWarnings` via
   `formatSharedDepWarnings(checkSharedDeps(pkgJson, hostVersions))` where
   `hostVersions = (await getSharedDeps())?.versions ?? {}` (empty → no
   warnings; vendor-off hosts can't check). Store on the `RegistryPackage`
   entry (the type field from Task 2).
2. `package-manager-list.tsx` `PackageManagerListItem`: next to the
   "Update available" chip (line ~212-217 pattern), render:
```tsx
{registryPackage.sharedDepWarnings?.length ? (
  <span
    title={registryPackage.sharedDepWarnings.join("\n")}
    className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600"
  >
    <Icon name="TriangleAlert" size={10} />
    Shared deps mismatch
  </span>
) : null}
```
   (Match the existing chip styling conventions of the file; `TriangleAlert`
   is already used in the design-system — verify the exact Icon name used
   there for warnings and reuse it.)
3. `package-manager.ts` `#loadPackageFromRegistry`: after the existing
   package.json fetch, before loading:
```ts
const versions = (await getSharedDeps())?.versions;
if (versions) {
  const warnings = formatSharedDepWarnings(checkSharedDeps(pkgJson, versions));
  if (warnings.length) console.error(`[package-manager] shared-deps mismatch for ${name}:\n` + warnings.join("\n"));
}
```
   Non-blocking: the install proceeds (the issue asks for a *warning*).

**Tests:** the warning computation is Task 1's tested pure function; the
hook wiring is thin. Add one design-system render test only if the package
has an existing vitest+jsdom setup for the package-manager component (check
`packages/design-system/src/connect/components/modal/settings-modal-v2/package-manager/*.test.*`); otherwise cover the chip via the existing
storybook story + Task 10's E2E (visual).
**Verify:** `pnpm tsc` (design-system + connect) + the package's existing
tests (`pnpm --filter <design-system pkg> test`).
**Commit:** `feat(connect): warn on shared-deps version mismatch in the package manager (#2359)`

---

## Task 10 — Docs: package-developer guide + ADR 0003

**Files:** `docs/SHARED-DEPENDENCIES.md` (new), `docs/adr/0003-*.md` (new —
read `docs/adr/0002-*.md` for the exact house format and the `adr` skill
before writing).

Guide contents (terse, factual):
- What is shared (the `SHARED_DEPS` table + the vendor include list), and
  why (download size, single instance).
- What `ph build` does by default (externalizes the set; the post-build
  warning and what it means) and `--no-shared-deps`.
- Version compatibility: the host publishes a fixed version table per
  build; how to check yours (`checkSharedDeps` is in
  `@powerhousedao/shared/connect`); the PM warning.
- Worker behavior: import maps don't apply in workers; the host rewrites
  shared + relative imports and blob-imports the source — packages don't
  need to do anything, but their shared-dep versions must be compatible.
- Escape hatches: `--no-shared-deps` (package), `PH_CONNECT_VENDOR=0`
  (host).

ADR 0003: decision record per the spec (status Accepted, decider from
`git config user.name`, implemented by this branch).

**Verify:** none (docs). **Commit:** `docs: shared-deps package-developer guide + ADR 0003 (#2359)`

---

## Task 11 — End-to-end verification

Run in the worktree; this is the evidence the feature works.

1. **Package build:** `cd packages/vetra-packages && pnpm ph build` (or the
   package's actual build script) → inspect `dist/browser/`: bare imports of
   `document-model` / `@powerhousedao/reactor-browser` present; no bundled
   copy (grep for a known document-model symbol that shouldn't appear);
   post-build scan prints no warning. Then `ph build --no-shared-deps` →
   the deps ARE bundled (control).
2. **Connect production build:** `pnpm ph connect build` (in apps/connect or
   the project the CLI targets) →
   - `dist/__vendor__/` populated; `dist/__vendor__/shared-deps.js` exports
     `imports` + `versions`.
   - `dist/index.html` import map contains the vendor entries (base-prefixed
     like the `__react__` ones).
   - The app's JS chunks contain bare `import "document-model"` etc. (not
     inlined).
   - Dynamic-base variant (`PH_CONNECT_DYNAMIC_BASE` or the flag the
     service uses): placeholder present in the map values, same as the
     `__react__` entries.
3. **Runtime (browser, dev server with `PH_CONNECT_EXTERNALIZE_VENDOR=1` and
   the production build served via `vite preview` or the docker flow):**
   install a package that imports shared deps (use a vetra package built in
   step 1 against the local registry per `docs/LOCAL-REGISTRY-SETUP.md` if
   available) →
   - Network: `document-model`/`reactor-browser` fetched once from
     `__vendor__`, not per-package from the CDN.
   - Console: no "two React instances"-class errors; the document model
     loads in the worker (worker path exercised — the blob import fires).
   - Package Manager shows the warning chip for a fixture package with a
     deliberately mismatched shared-dep range (build a tiny fixture package
     with `document-model: "^99.0.0"` — never published, but the range
     check only needs the range + host version).
   - PWA: service worker's precache manifest includes the `__vendor__`
     files (check via the SW console / `workbox` precache list); offline
     reload works (devtools offline mode).
4. **Repo-wide:** `pnpm tsc`, `pnpm lint` (or the repo's lint script),
   `pnpm test` at the root — all green.

**Commit:** (any small fixes found) then done.

## Finishing

- `scripts/new-worktree.sh` convention: the worktree branch
  `chore/2359-shared-deps-bundle` is the deliverable; push it and open the
  PR to `main` referencing #2359 (comment on the issue per its stale-bot
  request: status update + pointer to the PR).
- Follow the superpowers `finishing-a-development-branch` skill for the
  merge flow once the PR is approved.

## Implementation corrections (made during Tasks 5–9)

Deviations from the original plan found while verifying end-to-end, each
confirmed against `main`:

1. **The bare `@powerhousedao/shared` root is excluded from the vendor
   include** (Task 5). Its type barrel
   (`packages/shared/types/index.ts` → `../clis/types.js`) references
   node-only modules, which the current vite/rolldown cannot bundle for the
   browser — vendoring the root fails the build even on `main`. The
   browser-safe subpaths are shared instead (`SHARED_SUBPATHS` in
   `packages/shared/connect/shared-deps.ts`: `connect`, `document-model`,
   `processors`, `document-drive`, `registry`, `registry/urls`,
   `registry/manifest-slim`). The root stays in `SHARED_DEPS` for
   matching/externalization semantics; a bare-root import in a package
   simply is not externalized.
2. **`runConnectBuild` creates the app out dir before the vendor prebuild**
   (Task 5). The package build writes to `dist/`, but the vendor goes to
   the app out dir (default `.ph/connect-build/dist/`); its build lock is a
   sibling created with a non-recursive `mkdir`, so the parent had to exist
   first. Without this, `ph connect build` failed with an empty error
   message (the lock-acquire path returns null silently).
3. **`resolveDepVersions` resolves through the project's own
   `node_modules` link first** (Task 3), falling back to
   `require.resolve`. The old CJS-only resolution returned the `"missing"`
   sentinel for every ESM-only workspace package (their `exports` maps have
   no CJS condition), which would have disabled the entire version
   compatibility feature (all host versions unknown ⇒ no warnings ever).
   A self-referencing project (a vendoring Connect app) reads its own
   `package.json`.
4. **`expandIncludeSubpaths` drops unresolvable includes** (Task 5).
   Projects that do not install every shared dep (generated projects only
   peer-depend on `document-model` and `@powerhousedao/reactor-browser`)
   would otherwise fail the whole vendor build on a missing package; the
   missing one is simply not shared.
