---
toc_max_heading_level: 3
---

# Document model registry and version upgrades

The **document model registry** holds document model modules keyed by document type and version. The reactor uses it to resolve the reducer, utils, and specification for a given document when it executes a job. It also holds **upgrade manifests** that describe how to migrate a document from one model version to the next.

You register modules and manifests on the [`ReactorBuilder`](/academy/Reference/Reactor/AdvancedReactorUsage). At runtime you read the registry through the reactor module field `documentModelRegistry`, or through the [`useModelRegistry`](#accessing-the-registry) hook in the browser.

```typescript
import { ReactorBuilder } from "@powerhousedao/reactor";

const reactor = await new ReactorBuilder()
  .withDocumentModels([todoModuleV1, todoModuleV2])
  .withUpgradeManifests([todoUpgradeManifest])
  .build();
```

`withDocumentModels` and `withUpgradeManifests` each **replace** the array passed to them — calling either twice keeps only the last array, it does not append. Order between the two calls does not matter: the builder always registers manifests before modules.

Registration at build time is non-fatal. A duplicate or invalid module or manifest is logged through the builder's logger and skipped; the build still completes. Do not wrap `.build()` in a try/catch expecting a registration failure to throw — check the logs instead.

## Accessing the registry

The registry instance lives on the reactor module as `documentModelRegistry: IDocumentModelRegistry`. This field is present on both in-process and worker-backed reactors.

In the browser, read it with `useModelRegistry`:

```typescript
import { useModelRegistry } from "@powerhousedao/reactor-browser";

const registry = useModelRegistry(); // IDocumentModelRegistry | undefined
```

`useModelRegistry` returns `undefined` until the reactor client module is set on the PH global. Guard the result before calling registry methods.

The core `IReactor` interface does not expose the registry directly. To list model data through the reactor, use `reactor.getDocumentModels(namespace?, paging?, signal?)`, which reads `getAllModules()` internally and filters by document-type prefix.

## `IDocumentModelRegistry` reference

`IDocumentModelRegistry` is the contract for both module management and the upgrade API. The default in-memory implementation is `DocumentModelRegistry`. Both are exported from `@powerhousedao/reactor`.

The document type used as the lookup key is `module.documentModel.global.id`. A module's version comes from its optional `version` field, which the registry treats as `1` when absent.

### Module management

#### `registerModules`

```typescript
registerModules(
  ...modules: DocumentModelModule<any>[]
): RegistrationResult<DocumentModelModule<any>>[];
```

Registers one or more modules. Modules without a `version` default to version 1. Two different versions of the same document type coexist. A module whose `(documentType, version)` pair is already registered produces a `DuplicateModuleError` in its result. This method **never throws** — it returns one [`RegistrationResult`](#registrationresult) per input module, in input order. Invalid or duplicate modules are skipped without affecting the rest.

#### `unregisterModules`

```typescript
unregisterModules(...documentTypes: string[]): boolean;
```

Removes all versions of each given document type. Returns `true` only if every requested type was found. Returns `false` if any was missing, while still removing the types that exist.

#### `getModule`

```typescript
getModule(documentType: string, version?: number): DocumentModelModule<any>;
```

Returns the module for a document type. With `version` omitted, returns the highest registered version. With `version` given, returns that exact version. Throws `ModuleNotFoundError` if the type is unknown, or if the specific version is not registered even when other versions exist.

#### `getAllModules`

```typescript
getAllModules(): DocumentModelModule<any>[];
```

Returns a copy of every registered module across all types and versions.

#### `getSupportedVersions`

```typescript
getSupportedVersions(documentType: string): number[];
```

Returns the registered version numbers for a type, sorted ascending. Throws `ModuleNotFoundError` if none are registered for the type.

#### `getLatestVersion`

```typescript
getLatestVersion(documentType: string): number;
```

Returns the highest registered version number for a type. Throws `ModuleNotFoundError` if none are registered.

#### `clear`

```typescript
clear(): void;
```

Removes all modules and all upgrade manifests.

### `RegistrationResult`

`registerModules` and `registerUpgradeManifests` report per-item outcomes instead of throwing:

```typescript
export type RegistrationResult<T> =
  | { status: "success"; item: T }
  | { status: "error"; item: T; error: Error };
```

`item` is present on both branches — the registered or offending object is echoed back even on error. Check `result.status === "error"` for each element.

```typescript
const results = registry.registerModules(todoModuleV1, todoModuleV2);
for (const result of results) {
  if (result.status === "error") {
    console.error("skipped", result.item.documentModel.global.id, result.error.message);
  }
}
```

`RegistrationResult` is not exported from `@powerhousedao/reactor`, and the package has no `registry` subpath. Reference it structurally, or read `result.status` (`"success"` or `"error"`) directly as shown above.

### `DocumentModelModule`

The shape registered with the registry:

```typescript
export type DocumentModelModule<TState extends PHBaseState = PHBaseState> = {
  version?: number;
  reducer: Reducer<TState>;
  actions: Actions;
  utils: DocumentModelUtils<TState>;
  documentModel: DocumentModelPHState; // .global.id is the document type key
};
```

`version` is optional. The source marks it "should be made required"; module versioning is not finalized, and the registry defaults a missing `version` to `1` everywhere.

## Version upgrades

An **upgrade manifest** declares the supported versions of a document type and the transition that moves a document up each single version step. The registry stores one manifest per document type and exposes methods to look it up and to compute the steps between two versions.

### Upgrade types

These types come from `@powerhousedao/shared/document-model` (aliased as `document-model` in generated files).

```typescript
export type UpgradeReducer<
  TFrom extends PHBaseState,
  TTo extends PHBaseState,
> = (document: PHDocument<TFrom>, action: Action) => PHDocument<TTo>;

export type UpgradeTransition = {
  toVersion: number;
  upgradeReducer: UpgradeReducer<any, any>;
  description?: string;
};

export type UpgradeManifest<TVersions extends readonly number[]> = {
  documentType: string;
  latestVersion: TupleMember<TVersions>;  // union of versions, e.g. 1 | 2 | 3
  supportedVersions: TVersions;           // the tuple, e.g. [1, 2, 3]
  upgrades: {
    // keys: "v2" | "v3" | ... — no "v1" key (v1 is the base)
    [V in Exclude<TupleMember<TVersions>, 1> as `v${V}`]: UpgradeTransition;
  };
};
```

Pass `TVersions` as a `readonly number[]` tuple (use `as const`). The type forces an `upgrades` key for every supported version except `1`: a manifest for `[1, 2, 3]` requires `v2` and `v3`. There is no `v1` key, because v1 is the base version. Registry methods type the manifest loosely as `UpgradeManifest<readonly number[]>`.

The registry does not cross-check a manifest's versions against registered modules. Registering a manifest whose `supportedVersions` do not match the registered module versions succeeds.

### Authoring a manifest

Manifest files are codegen output and carry a `WARNING: DO NOT EDIT` header. You author them by adding versions and upgrade reducers through codegen, not by editing the manifest by hand. The generated shape splits across three files.

`versions.ts` declares the tuple:

```typescript
export const supportedVersions = [1, 2] as const;
export const latestVersion = supportedVersions[1];
```

A transition file (`v2.ts`) holds the reducer for one step:

```typescript
import type { UpgradeTransition } from "document-model";

export const v2: UpgradeTransition = {
  toVersion: 2,
  upgradeReducer, // (document: PHDocument<StateV1>, action) => PHDocument<StateV2>
  description: "",
};
```

`upgrade-manifest.ts` assembles them:

```typescript
import type { UpgradeManifest } from "document-model";
import { v2 } from "./v2.js";
import { latestVersion, supportedVersions } from "./versions.js";

export const todoUpgradeManifest: UpgradeManifest<typeof supportedVersions> = {
  documentType: "test/todo",
  latestVersion,
  supportedVersions,
  upgrades: { v2 }, // key "v2", no "v1"
};
```

A manifest with only v1 has an empty `upgrades: {}`.

### Upgrade API

#### `registerUpgradeManifests`

```typescript
registerUpgradeManifests(
  ...manifests: UpgradeManifest<readonly number[]>[]
): RegistrationResult<UpgradeManifest<readonly number[]>>[];
```

Registers one or more manifests. A manifest with a falsy `documentType`, or one whose type already has a manifest (`DuplicateManifestError`), produces an error result. Like `registerModules`, this method never throws and returns one [`RegistrationResult`](#registrationresult) per input. Use `withUpgradeManifests` on the builder to register at build time.

#### `unregisterUpgradeManifests`

```typescript
unregisterUpgradeManifests(...documentTypes: string[]): boolean;
```

Removes the manifest for each given type. Returns `true` only if every type had a manifest; removes those that exist regardless.

#### `getUpgradeManifest`

```typescript
getUpgradeManifest(documentType: string): UpgradeManifest<readonly number[]>;
```

Returns the registered manifest. Throws `ManifestNotFoundError` if none exists for the type.

#### `computeUpgradePath`

```typescript
computeUpgradePath(
  documentType: string,
  fromVersion: number,
  toVersion: number,
): UpgradeTransition[];
```

Returns the ordered transitions to move from `fromVersion` to `toVersion`. It walks the keys `v(from+1)..v(to)`. Behavior:

- `from === to` returns `[]` and skips the manifest lookup, so it does not throw when no manifest is registered.
- `to < from` throws `DowngradeNotSupportedError` before the manifest lookup.
- No manifest for the type throws `ManifestNotFoundError`.
- A missing step in the range throws `MissingUpgradeTransitionError`.

#### `getUpgradeReducer`

```typescript
getUpgradeReducer(
  documentType: string,
  fromVersion: number,
  toVersion: number,
): UpgradeReducer<any, any>;
```

Returns the reducer for a **single** step, where `toVersion` must equal `fromVersion + 1`. The single-step check runs before the manifest lookup, so `InvalidUpgradeStepError` fires even with no manifest registered. Throws `ManifestNotFoundError` if no manifest exists, or `MissingUpgradeTransitionError` if that one transition is absent.

### Upgrade path example

Given `todoUpgradeManifest` for `test/todo` with `supportedVersions = [1, 2]`:

```typescript
const registry = useModelRegistry();
if (!registry) return;

// Steps from v1 to v2: [v2 transition]
const path = registry.computeUpgradePath("test/todo", 1, 2);

// Same version: [] — no manifest needed
const none = registry.computeUpgradePath("test/todo", 2, 2);

// Single-step reducer for v1 -> v2
const reducer = registry.getUpgradeReducer("test/todo", 1, 2);

// Downgrade throws DowngradeNotSupportedError
registry.computeUpgradePath("test/todo", 2, 1);

// Non-single-step throws InvalidUpgradeStepError (no v3 manifest needed to fail)
registry.getUpgradeReducer("test/todo", 1, 3);
```

## Errors

All registry errors extend `Error` and set `name`. Each class with a static `isError(error): error is X` guard checks `Error.isError(error) && error.name === "..."`.

| Error | `name` | Thrown when |
| --- | --- | --- |
| `ModuleNotFoundError` | `"ModuleNotFoundError"` | `getModule` for an unknown type or version; `getSupportedVersions` / `getLatestVersion` with no modules for the type. Carries `documentType`, `requestedVersion`. |
| `DuplicateModuleError` | `"DuplicateModuleError"` | `registerModules` when the `(documentType, version)` pair is already registered (returned in the result, not thrown). |
| `InvalidModuleError` | `"InvalidModuleError"` | Reserved for malformed modules. The in-memory `DocumentModelRegistry` does **not** throw it — duplicate is its only validation. |
| `DuplicateManifestError` | `"DuplicateManifestError"` | `registerUpgradeManifests` when the type already has a manifest (returned in the result). |
| `ManifestNotFoundError` | `"ManifestNotFoundError"` | `getUpgradeManifest`, and `computeUpgradePath` / `getUpgradeReducer`, when no manifest is registered for the type. |
| `DowngradeNotSupportedError` | `"DowngradeNotSupportedError"` | `computeUpgradePath` when `toVersion < fromVersion`. Carries `documentType`, `fromVersion`, `toVersion`. |
| `MissingUpgradeTransitionError` | `"MissingUpgradeTransitionError"` | `computeUpgradePath` (a `v{n}` step in range is absent) and `getUpgradeReducer` (the single `v{to}` step is absent). |
| `InvalidUpgradeStepError` | `"InvalidUpgradeStepError"` | `getUpgradeReducer` when `toVersion !== fromVersion + 1`. |

Of these, `ModuleNotFoundError`, `DuplicateModuleError`, and `DuplicateManifestError` have an `isError` guard. `InvalidModuleError`, `ManifestNotFoundError`, `MissingUpgradeTransitionError`, and `InvalidUpgradeStepError` do not — match on `error.name` instead.

Export-surface gap: only `ModuleNotFoundError`, `DuplicateModuleError`, `InvalidModuleError`, and `DuplicateManifestError` are exported from `@powerhousedao/reactor`. `ManifestNotFoundError`, `MissingUpgradeTransitionError`, and `InvalidUpgradeStepError` are not exported, and the package has no `registry` subpath, so match those three on `error.name` even though `getUpgradeManifest`, `computeUpgradePath`, and `getUpgradeReducer` throw them. `DowngradeNotSupportedError` is available from `@powerhousedao/shared/document-model`.

For the full reactor error taxonomy across job execution, sync, and storage, see [Error handling](/academy/Reference/Reactor/ErrorHandling).

## Related

- [Working with the Reactor](/academy/Reference/Reactor/WorkingWithTheReactor)
- [Advanced Reactor Usage](/academy/Reference/Reactor/AdvancedReactorUsage) — `ReactorBuilder` wiring
- [IReactorClient](/academy/Reference/Reactor/ReactorClient)
- [Processors](/academy/Reference/Reactor/Processors) and [Building a processor](/academy/Build/WorkWithData/BuildingAProcessor)
