# Upgrades

> **Implementation**: See [create-upgrade-actions-migration.md](./create-upgrade-actions-migration.md) for step-by-step plan on adding CREATE_DOCUMENT and UPGRADE_DOCUMENT actions to the legacy base-server.

### Summary

Document Model upgrades provide a systematic approach to versioning and backward compatibility.

In Reactor, Actions represent user intents and Operations represent commands in the Command Sourcing architecture.

However, unlike typical ES approaches, Operations _are never upcasted_. That is, version upgrades never mutate Operations. Instead, every `Action` must be executed by a specific version of the corresponding document model library to result in the expected `Operation`.

Operations are then decoupled from versioning, as the `Action` holds this information.

### Document Creation Flow

Suppose we have a Document Model of type `ph/todo`.

1. First, we create a new document:

```tsx
import { createDocument } from "ph/todo";

const doc = await createDocument({
  title: "My Todo List",
});
```

2. Next, we submit it to the `IReactor`.

```tsx
const jobStatus = await reactor.create(doc);
```

3. Internally, the `IReactor` will:

- Create an `Action` of type `CREATE_DOCUMENT`.
- Create an `Action` of type `UPGRADE_DOCUMENT`.
- Submit both actions in a single `Job` to the `IQueue`.

4. The `IJobExecutor` will pull the `Job` from the `IQueue` and execute it.

5. The `Job` will be executed by the `IReactor`, which will:

- Create an `Operation` for the `CREATE_DOCUMENT` action. This will result in the creation of a new document with a default `PHBaseState`.

- Create an `Operation` for the `UPGRADE_DOCUMENT` action with an initial state object. Eg - `{ "myScope": { title: "My Todo List" } }`.

If a `CREATE_DOCUMENT` action is submitted in a job without an immediate `UPGRADE_DOCUMENT`, then the job will fail with a specific error message.

### CREATE_DOCUMENT Action

The `CREATE_DOCUMENT` action is responsible for creating the base record for a new document. It does not materialize any model-specific state. Instead, it persists the minimal base state and metadata necessary for a document to exist, and then delegates all model-state initialization to a subsequent `UPGRADE_DOCUMENT` action (included in the same `Job`). The `version` field is set to `"0"` to indicate that the document is in the initial state (not yet upgraded).

Input schema:

```ts
type CreateDocumentAction = {
  type: 'CREATE_DOCUMENT';
  model: string;           // e.g., 'ph/todo'
  version: string;         // '0' (initial state, not yet upgraded)
  signing: SignedHeaderParameters;
};
```

Signed header parameters (only what is necessary for verification):

```ts
type SignedHeaderParameters = {
  signature: string;
  publicKey: JsonWebKey;
  nonce: string;
  createdAtUtcIso: string;
  documentType: string;
};
```

**Execution (by `IReactor`)**:
  1. Validate model exists and that the runtime can execute this action with the referenced model version.
  2. Verify signature:
     - Ensure `signing.documentType === model`.
     - Verify signature using the payload `{ documentType: signing.documentType, createdAtUtcIso: signing.createdAtUtcIso, nonce: signing.nonce }`, the `signing.signature`, and a signer constructed from `signing.publicKey` (equivalent to `validateHeader`). Reject the action if invalid.
     - Enforce `documentId === signing.signature` to keep the storage identifier consistent with the signed header id.
  3. Persist a new document with a default `PHBaseState` (no model-specific fields yet). Populate the `header` scope from the provided values:
  4. Set initial revision to 0.

**Resulting `Operation`**: A `CREATE_DOCUMENT` operation that acts as the base document record. No user/model fields beyond `PHBaseState` are written by this action.

### UPGRADE_DOCUMENT Action

The `UPGRADE_DOCUMENT` action materializes or transforms the model-specific state for a document to a target version.

Input schema:

```ts
type UpgradeDocumentAction = {
  type: 'UPGRADE_DOCUMENT';
  model: string;
  fromVersion: string;
  toVersion: string;
  documentId: string;
  initialState: object;
};
```

**Execution (by `IReactor`)**:
  1. Resolve supported versions for the `model` via `getDocumentModels()` and ensure `toVersion` and `fromVersion` are supported (in the case of version `"0"`, the document has just been created and has only `PHBaseState`).
  2. Compute an upgrade plan:
     - If `fromVersion == toVersion`: no-op, return success without emitting state changes.
     - If `fromVersion` is `"0"` (first upgrade): initialize model-specific state using the `initialState` field.
     - If `toVersion` is greater than `fromVersion`: apply a sequence of `UpgradeReducer`s for each version between `fromVersion` and `toVersion`.
     - If `toVersion` is less than `fromVersion`: capture an operation error.
  3. Apply the changes to the `document` scope with the `toVersion`.
  4. Emit a single `UPGRADE_DOCUMENT` operation that captures the version transition and the state delta.

---

## Document Model Package Structure

Each document model NPM package contains all the code necessary to move from version to version. This means that it must include multiple versions of the same model, along with upgrade reducers to transform state between versions.

### Directory Structure

```
my-doc/
├── package.json              # NPM package with subpath exports
├── src/
│   ├── index.ts              # Root exports (manifest, latest re-export)
│   ├── versions.ts           # Version constants
│   │
│   ├── v1/                   # Version 1 implementation
│   │   ├── index.ts          # Exports DocumentModelModule for v1
│   │   ├── actions.ts        # Action creators
│   │   ├── reducer.ts        # State reducer
│   │   ├── types.ts          # TypeScript types for v1 state
│   │   ├── state.ts          # State utilities
│   │   ├── constants.ts      # Initial state, file extension
│   │   └── module.ts         # DocumentModelModule assembly
│   │
│   ├── v2/                   # Version 2 implementation
│   │   └── ...               # Same structure as v1
│   │
│   ├── reducers/             # Upgrade reducers
│   │   ├── index.ts          # Exports upgrade manifest
│   │   ├── v1-to-v2.ts       # Upgrade reducer v1 -> v2
│   │   └── v2-to-v3.ts       # Upgrade reducer v2 -> v3
│   │
│   └── manifest.ts           # Package metadata
```

Each version directory (`v1/`, `v2/`, etc.) contains a complete, self-contained implementation of the document model at that version. This includes all types, actions, reducers, and utilities needed to work with documents at that version.

### package.json Exports

Document model packages use subpath exports to allow consumers to import specific versions:

```json
{
  "name": "my-doc",
  "version": "1.0.0",
  "type": "module",
  "exports": {
    ".": {
      "import": "./dist/src/index.js",
      "types": "./dist/src/index.d.ts"
    },
    "./v1": {
      "import": "./dist/src/v1/index.js",
      "types": "./dist/src/v1/index.d.ts"
    },
    "./v2": {
      "import": "./dist/src/v2/index.js",
      "types": "./dist/src/v2/index.d.ts"
    },
    "./latest": {
      "import": "./dist/src/v2/index.js",
      "types": "./dist/src/v2/index.d.ts"
    },
    "./reducers": {
      "import": "./dist/src/reducers/index.js",
      "types": "./dist/src/reducers/index.d.ts"
    }
  }
}
```

**Import patterns:**
- `import * from 'my-doc/v1'` - Import specific version
- `import * from 'my-doc/v2'` - Import specific version
- `import * from 'my-doc/latest'` - Alias to newest version
- `import { upgradeManifest } from 'my-doc'` - Import upgrade manifest from root

---

## Upgrade Manifest

The upgrade manifest declares all supported versions and upgrade paths for a document model. Package authors export this manifest to enable the reactor to resolve upgrade chains.

### Types

```typescript
/** Document model version - simple integer (1, 2, 3, ...) */
export type ModelVersion = number;

/** Upgrade reducer transforms a document from one version to another */
export type UpgradeReducer<TFrom, TTo> = (
  document: PHDocument<TFrom>,
  action: Action,
) => PHDocument<TTo>;

/** Metadata about a version transition */
export type UpgradeTransition = {
  fromVersion: ModelVersion;
  toVersion: ModelVersion;
  reducer: UpgradeReducer;
  description?: string;
};

/** Manifest declaring all supported versions and upgrade paths */
export type UpgradeManifest = {
  documentType: string;
  latestVersion: ModelVersion;
  supportedVersions: ModelVersion[];  // e.g., [1, 2, 3]
  upgrades: Map<string, UpgradeTransition>;  // key: "1->2", "2->3"
};
```

### Manifest Builder

Package authors use the `UpgradeManifestBuilder` to construct their manifest:

```typescript
// reducers/index.ts
import { UpgradeManifestBuilder } from 'document-model';
import { upgradeV1ToV2 } from './v1-to-v2.js';
import { upgradeV2ToV3 } from './v2-to-v3.js';

export const upgradeManifest = new UpgradeManifestBuilder('ph/todo')
  .addUpgrade(1, 2, upgradeV1ToV2, 'Add priority field to items')
  .addUpgrade(2, 3, upgradeV2ToV3, 'Add tags support')
  .build();
```

---

## Upgrade Reducers

Upgrade reducers are special reducers that transform a document's state from one version to another. They are called sequentially when upgrading across multiple versions.

### Convention

Each upgrade reducer file (`reducers/v1-to-v2.ts`, `reducers/v2-to-v3.ts`, etc.) exports a single upgrade reducer function:

```typescript
// reducers/v1-to-v2.ts
import type { UpgradeReducer } from 'document-model';
import type { TodoPHState as V1State } from '../v1/types.js';
import type { TodoPHState as V2State } from '../v2/types.js';

export const upgradeV1ToV2: UpgradeReducer<V1State, V2State> = (document, action) => {
  const v1State = document.state;

  return {
    ...document,
    state: {
      ...v1State,
      global: {
        title: v1State.global.title,
        description: '',  // New field with default value
        items: v1State.global.items.map(item => ({
          ...item,
          createdAt: new Date().toISOString(),
          priority: 'medium',
        })),
      },
    },
  };
};
```

### Key Principles

1. **Pure functions**: Upgrade reducers must be pure functions with no side effects.
2. **Version-specific types**: Import types from both source and target version directories.
3. **Default values**: New fields must be initialized with sensible defaults.
4. **Data preservation**: Existing data must be preserved or transformed, never lost.

---

## Reactor Integration

### Registry Methods

The reactor registry provides methods for version-aware module resolution:

- `registerUpgradeManifest(manifest)` - Register a package's upgrade manifest
- `getSupportedVersions(documentType)` - Get list of available versions (e.g., `[1, 2, 3]`)
- `getLatestVersion(documentType)` - Get the newest version number
- `computeUpgradePath(type, from, to)` - Compute the upgrade chain
- `getUpgradeReducer(type, from, to)` - Get a specific upgrade reducer

### Upgrade Execution Flow

When `UPGRADE_DOCUMENT` is executed with `fromVersion !== "0"`:

1. **Compute upgrade path**: Use manifest to find sequence of transitions (e.g., `1->2->3`)
2. **Apply reducers sequentially**: Execute each upgrade reducer in order
3. **Emit single operation**: Record one `UPGRADE_DOCUMENT` operation with final state

```
Document at v1
    |
    v
upgradeV1ToV2(doc, action) -> Document at v2
    |
    v
upgradeV2ToV3(doc, action) -> Document at v3
    |
    v
Single UPGRADE_DOCUMENT operation emitted
```

### Supported Versions

The `[IReactor](../Reactor/interface.md)` interface provides a `getDocumentModels` method that returns `DocumentModelState` objects. These objects contain a list of supported versions for a given document model.
