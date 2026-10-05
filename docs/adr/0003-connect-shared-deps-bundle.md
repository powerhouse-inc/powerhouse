# ADR 0003 — Shared dependency bundles for Connect and dynamically loaded packages

- **Status:** Accepted
- **Date:** 2026-09-15
- **Deciders:** froid1911
- **Implemented by:** branch `chore/2359-shared-deps-bundle` (issue #2359)
- **Implementation notes:** the vendor prebuild, import-map wiring, build-time
  externalization, and version-compatibility checks described here are
  implemented and verified by that branch; the package-developer guide is
  `docs/SHARED-DEPENDENCIES.md`.

## Context

Connect loads editor and functionality packages at runtime (local packages and
registry packages fetched from the CDN). Each package's build bundled its own
copies of the dependencies it shares with Connect itself — `document-model`,
`@powerhousedao/reactor-browser`, `@powerhousedao/design-system/connect`,
`@powerhousedao/shared/*`, and so on. React was already shared between the app
and packages through the self-hosted `__react__` import map; everything else
was duplicated.

The duplication has three costs:

- **Download size.** Every installed package re-downloads several megabytes
  of code the page already has.
- **Version drift.** A package built against a different minor of a shared
  dependency runs a second, divergent copy next to the host's — the classic
  two-React-instances failure mode, but for any shared library.
- **Cache waste.** The service worker precaches per-package copies of
  identical code.

The constraint that shapes the design: import maps (the existing React
sharing mechanism) cannot apply inside workers — the reactor worker loads
packages as blob URLs. And a production deploy serves Connect from an
immutable build directory, so any shared code must be part of that build
output, not assembled at request time.

## Decision

### 1. One canonical shared list

`@powerhousedao/shared/connect` exports `SHARED_DEPS` — the specifier-to-npm
package list of what Connect and packages share: `document-model`,
`@powerhousedao/document-engineering`, `@powerhousedao/shared` (subpaths; the
bare root is not vendorable — see Alternatives), `@powerhousedao/shared/registry/urls`,
`@powerhousedao/design-system/connect`, `@powerhousedao/reactor-browser`.
Every mechanism below keys off this one list. `@powerhousedao/connect` is
deliberately absent: it is the Connect app itself and has no importable
exports, so externalizing it would make the app import itself through the
vendor.

### 2. A prebuilt vendor directory in every production build

`ph connect build` (and the dev server's vendor mode) prebuilds the shared
set into a static `__vendor__/` directory inside the build output — one entry
file per specifier, plus an `import-map.json` and a `shared-deps.js` runtime
module. The import map (already in the page for React) gains the vendor
entries; the app build and the packages' builds externalize the shared set
onto it. One copy per deploy, referenced by every consumer; the service
worker precaches it once.

The production include is the dev-server heavy set ∪ the shared set, minus
`@powerhousedao/connect`: the dev server vendors the app to keep rebuilds
cheap, but in a production build the app *is* Connect, so nothing resolves
its import-map entry and its vendor entry is pure dead weight (~54MB of
unreferenced output in the vetra-e2e fixture).

The vendor is a **build artifact, not a runtime fetch**: it is produced in a
throwaway subprocess before the app build, cached by a version digest of the
resolved dependency versions, and fails the production build if it cannot be
produced. A dev server keeps its existing soft fallback (fall back to
dep-optimizing the heavy libs) because a dev server must never be blocked by
a bundling hiccup.

### 3. `ph build` externalizes the shared set by default

A package's `ph build` marks the shared list `neverBundle`, so the package's
output keeps bare imports that resolve through the import map at load time —
the package's tgz/bundle no longer contains those dependencies. A post-build
scan warns when a shared dep was imported in source but inlined in the
output anyway (a `neverBundle` misconfiguration), and `--no-shared-deps`
reverts to the old fully-bundled behavior for packages that need it.

### 4. The worker path rewrites imports instead of relying on import maps

Workers cannot see import maps. The host's reactor worker, when loading a
package, rewrites the package source's shared-specifier and relative imports
onto the vendor's absolute URLs and blob-imports the rewritten source.
Packages need no build-time knowledge of this; the cost is that a package's
shared-dep **versions** must still be compatible with the host's (decision 5).

### 5. Version compatibility is checked, and mismatches are warned

Each vendor build records the resolved version of every shared package in
`shared-deps.js` (the `versions` table) and the host reads it at startup
(`getSharedDeps()`). A package's npm `package.json` (served next to its
bundle on the CDN) declares the ranges it was built against; the host
compares them with `checkSharedDeps` and, on mismatch, warns — a warning
chip on the Package Manager row, and a `console.error` at install time.
Warning, not blocking: the package still installs and usually still works
(the semver range is the package's claim, not a hard contract), but the
developer hears about the drift before a subtle double-instance bug bites.
Dev / vendor-off hosts have no table and skip the check entirely.

## Consequences

### Positive

- Packages ship without their copies of the shared set; a typical editor
  package's download shrinks by the size of the shared dependencies.
- One instance per shared library across the app and all loaded packages —
  the React-instance class of bug is closed for the whole shared set, not
  just React.
- Version drift becomes visible (PM chip + install-time console error)
  instead of manifesting as runtime weirdness.
- Everything degrades softly: `PH_CONNECT_VENDOR=0` (host) and
  `--no-shared-deps` (package) reproduce pre-change behavior; a dev-server
  prebuild failure falls back to dep-optimization; an undiscovered subpath
  import is simply not externalized and bundles as before.

### Negative / risks

- The vendor adds build time (one extra bundling pass, cached by digest)
  and a `__vendor__/` directory to every deploy artifact.
- The import map is a global, first-come resource: two deploys of Connect
  with different vendor contents on one origin would fight over the bare
  specifiers. Acceptable while one deploy per origin is the deployment model.
- The worker rewrite parses package source at load time; a package whose
  source is malformed for the rewriter fails to load in the worker until the
  rewrite is extended.

### Confidence and revisit

Confidence is high: the mechanism reuses the proven React self-host import
map, the existing vendor prebuild infrastructure, and a pure semver
comparison for the compatibility check. Revisit if the import map's
exact-specifier limitation starts to bite (many new shared subpaths), if the
one-deploy-per-origin assumption changes, or if registry packages start
shipping builds for multiple host versions simultaneously.

## Alternatives considered

- **Keep the bare `@powerhousedao/shared` root in the vendor set.** Its
  type barrel references node-only modules (`clis/`), which the current
  vite/rolldown cannot bundle for the browser — vendoring the root fails the
  build (a pre-existing latent issue, reproduced on `main`). The
  browser-safe subpaths are shared instead; a bare-root import simply is not
  externalized.
- **Fetch shared deps from the CDN at runtime instead of bundling a vendor.**
  An immutable deploy cannot guarantee the availability or version of a
  runtime fetch, and it would re-introduce the download this removes.
- **Block installs on version mismatch.** The semver range in a published
  package's `package.json` is the package's claim about its own build; the
  host cannot know whether the package actually exercises the divergent
  code. A hard block would strand packages over one drifted transitive, so
  the check warns instead.
- **Per-package import maps / module shims per package.** Browsers support
  one import map; N packages would need N runtime rewrites of every import —
  strictly more moving parts than the host-side worker rewrite for the one
  environment that cannot use the map.
