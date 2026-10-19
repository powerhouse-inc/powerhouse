# Plan: package removal unregisters its document models

When a package goes away, its document models must leave the reactor's
document-model registry, their model subgraphs and supergraph types must stop
being served, and a package subgraph refused because a model held its name
must come back. A package whose load fails must keep its last good models.

## Root cause

The package manager emits `documentModelsChange` with a record of every
package's models. The listener unregisters only the types that a package still
in the record no longer provides. It skips a package that is missing from the
record or has no models, because both shapes also come from a failed load:

- The vite loader returns `[]` for a module that does not resolve (absent) and
  for one that resolves and throws (failed).
- The package manager records an all-loaders-failed package as `[]` on a full
  load and drops it on a per-package reload.

So three removal paths leave the models registered:

| Path | What the listener sees |
| --- | --- |
| `PackageManager.removePackage` | package missing |
| Last model deleted, `document-models/` removed (vite) | package missing |
| Package dropped from `powerhouse.config.json` | package missing |

`PackageManagementService.uninstallPackage` unregisters the types it
installed directly in the registry, so it already works for the packages it
installs. The other three paths go through the listener.

## Options

1. **Make the loader result say what happened.** Change
   `IPackageLoader.loadDocumentModels` to return
   `{ status: "loaded", models } | { status: "absent" } | { status: "failed" }`.
   This is explicit, but `IPackageLoader` is public and hosts implement it.
2. **Emit explicit removal events** next to the snapshot. This adds a second
   source of truth that has to agree with the snapshot.
3. **Use the existing loader contract.** `ImportPackageLoader` and
   `HttpPackageLoader` already return `[]` for "none" and throw on a failure.
   Make the vite loader do the same. The package manager then classifies each
   load and keeps a failed package's last good set in the snapshot, so the
   snapshot is authoritative and the listener can remove anything missing.

Chosen: option 3. Public types do not change, and Connect's
`IPackageManager` (reactor-browser) is not involved.

## Fix

- `vite-loader.mts`: `#load` still returns `undefined` when the module does
  not resolve. When the module resolves and `ssrLoadModule` throws, it logs as
  before and then throws an error tagged `PACKAGE_MODULE_FAILED`. The tag is
  needed because vite can report a missing import inside the package as
  `ERR_MODULE_NOT_FOUND` naming the package path, which `isExpectedLoaderMiss`
  would read as "absent". Watcher reloads that hit a tagged failure call no
  handler and report nothing, so a transient `ph vetra` build error does not
  reach Sentry and the last good set stays.
- `package-manager.ts`: each document-model load ends in one of these results:
  - `loaded`: a loader answered, even with `[]`.
  - `absent`: every loader threw an expected miss.
  - `failed`: some loader threw anything else.

  A `failed` package keeps its previous models and upgrade manifests, on both
  a per-package reload (no event) and a config reload. `loaded` with `[]` and
  `absent` drop the package. Tagged failures are excluded from the
  all-loaders-failed warning, because the loader has already logged them.
- `package-listeners.ts`: the removed types are every type tracked before the
  event that no package in the event provides. Tracking is then rebuilt from
  the event.

Behaviour changes:

- A vite failure now falls through to the next loader, which
  `ImportPackageLoader` failures already do.
- Subgraphs, processors and pieces keep their last good set only through the
  vite watcher skip. A config reload still drops them on a failure. Giving
  them the same classification is a follow-up.

## Tests

`graphql-manager.test.ts` ("through the package manager") uses a real
`PackageManager`, a fake subscribable loader, a real `DocumentModelRegistry`,
the listener and the GraphQL manager harness. The tests cover:

- `removePackage`
- a reload that returns no models
- a reload where every loader misses
- a config reload that drops the package
- a failed load, on change and on config reload

The removal tests assert that the registry types are gone, the model route is
disposed, the supergraph has no model types, and the stand-in package
subgraph is served under the freed name. The failure tests assert the last
good set in `getDocumentModels()`, the registry and the model subgraph.

The listener-level cases for a missing package and an empty package now
expect removal. A model that another package still provides stays registered.

`vite-loader-resolution.test.ts` checks that a broken module, and a module
whose own import is missing, throws tagged and is not classified as a miss.
`vite-loader-listeners.test.ts` checks that a failed reload calls no handler
and reports nothing.

`package-management-service.test.ts` checks that an uninstall through the
service unregisters the installed types.
