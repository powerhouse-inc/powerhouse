# Shared Dependencies: a guide for Powerhouse package developers

Connect shares a fixed set of dependencies with the packages it loads, so a
package does not ship (or download) its own copy of code the page already
runs. This page explains what is shared, what `ph build` does about it, how
version compatibility is enforced, and how to opt out.

## What is shared

The canonical list is `SHARED_DEPS` in `@powerhousedao/shared/connect`
(`packages/shared/connect/shared-deps.ts`):

| Import specifier | npm package |
| --- | --- |
| `document-model` | `document-model` |
| `@powerhousedao/document-engineering` | `@powerhousedao/document-engineering` |
| `@powerhousedao/shared` (subpaths only) | `@powerhousedao/shared` |
| `@powerhousedao/shared/registry/urls` | `@powerhousedao/shared` |
| `@powerhousedao/design-system/connect` | `@powerhousedao/design-system` |
| `@powerhousedao/reactor-browser` | `@powerhousedao/reactor-browser` |

React is shared too, but through the separate, pre-existing `__react__`
self-host import map.

A subpath of a listed package is shared whenever it is listed or is a
subpath of a listed specifier (e.g. `@powerhousedao/design-system/connect/toast`
under `@powerhousedao/design-system/connect`).

`@powerhousedao/shared` is the exception: the bare root is never vendored
(its barrel reaches node-only modules), and neither are subpaths outside
`SHARED_SUBPATHS` — `analytics`, `constants` and `clis` among them. Those
are not externalized either, so a package importing one simply bundles its
own copy rather than emitting a bare specifier nothing resolves.

`@powerhousedao/connect` is **not** shared: it is the Connect app itself.

## How it works

A Connect build (production `ph connect build`, or the dev server in vendor
mode) prebuilds the shared set into a static `__vendor__/` directory in the
build output and serves an import map that maps each shared specifier to
that directory. Two consumers lean on it:

- **The app build** externalizes the shared set, so Connect's own chunks
  keep bare imports that the import map resolves.
- **The package build** (`ph build`) marks the shared set as never-bundle,
  so a package's output keeps bare imports instead of inlined copies. At
  load time the import map resolves them to the one shared copy.

Workers cannot see import maps, so the host's reactor worker rewrites a
loaded package's shared (and relative) imports onto the vendor's absolute
URLs and blob-imports the rewritten source. Packages do nothing for this —
but it does mean a package's shared-dep **versions** must be compatible
with the host's (below).

## What `ph build` does by default

`ph build` externalizes `SHARED_DEPS` in your package's output. After the
build, a scan compares the shared imports found in your source with the
bare imports left in the output and warns when a shared dep was imported
but bundled anyway:

```
⚠ shared deps bundled instead of externalized: <spec> — check your neverBundle config
```

That means something in your build configuration forced the dep back into
the bundle (a custom `neverBundle`/`alwaysBundle` override, an alias, a
prebuild step). Fix the configuration so the shared set stays external.

To opt out entirely and ship a self-contained bundle as before:

```
ph build --no-shared-deps
```

Use this when the package must run in a host that does not provide the
shared set (or does not provide it at compatible versions).

## Version compatibility

Each Connect build records the resolved version of every shared package in
a `versions` table (`__vendor__/shared-deps.js`; the host reads it at
startup via `getSharedDeps()`). When you publish a package, its npm
`package.json` — served next to the bundle on the CDN — declares the ranges
you built against under `dependencies`/`peerDependencies`.

The host compares your declared ranges against its table:

- If a range the package declared does **not** include the host's installed
  version, the host warns: a warning chip on the package's row in the
  Package Manager, and a `console.error` naming the package and the
  offending ranges at install time. The package still installs — the host's
  copy is what runs at runtime either way — but the drift is surfaced
  instead of failing obscurely.
- Dev and vendor-off hosts have no table and skip the check.

You can run the same check in your own tooling: `checkSharedDeps(pkgJson,
hostVersions)` is exported from `@powerhousedao/shared/connect` and returns
one mismatch per unsatisfied shared dep.

In practice: depend on the shared packages through your workspace/catalog
versions (as generated projects do) rather than pinning exotic versions, and
the check passes by construction.

## Escape hatches

| Switch | Side | Effect |
| --- | --- | --- |
| `ph build --no-shared-deps` | package | fully-bundled output, as before this feature |
| `PH_CONNECT_VENDOR=0` | host build | no vendor directory, no shared import-map entries; Connect bundles its own copies (previous behavior) |

## Related

- Design: `docs/superpowers/specs/2026-09-15-connect-shared-deps-design.md`
- Decision record: `docs/adr/0003-connect-shared-deps-bundle.md`
