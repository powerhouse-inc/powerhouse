# Upgrades

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

The `CREATE_DOCUMENT` action is responsible for creating the base record for a new document. It does not materialize any model-specific state. Instead, it persists the minimal base state and metadata necessary for a document to exist, and then delegates all model-state initialization to a subsequent `UPGRADE_DOCUMENT` action (included in the same `Job`). The `version` field is set to `0.0.0` to indicate that the document is in the initial state.

Input schema:

```ts
type CreateDocumentAction = {
  type: 'CREATE_DOCUMENT';
  model: string;           // e.g., 'ph/todo'
  version: string;         // '0.0.0'
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
  1. Resolve supported versions for the `model` via `getDocumentModels()` and ensure `toVersion` and `fromVersion` are supported (in the case of version `0.0.0`, the document has just been created and has only `PHBaseState`).
  2. Compute an upgrade plan:
     - If `fromVersion == toVersion`: no-op, return success without emitting state changes.
     - If `fromVersion` is `0.0.0` (first upgrade): initialize model-specific state using the `initialState` field.
     - If `toVersion` is greater than `fromVersion`: apply a sequence of `UpgradeReducer`s for each version between `fromVersion` and `toVersion`.
     - If `toVersion` is less than `fromVersion`: capture an operation error.
  3. Apply the changes to the `document` scope with the `toVersion`.
  4. Emit a single `UPGRADE_DOCUMENT` operation that captures the version transition and the state delta.

#### Upgrade Reducer

Upgrade reducers are a special type of reducer that are used to upgrade a document from one version to another. They are called by subsequent upgrades. They are unique in that they require two versions of the document model.

```tsx
import { type MyDoc as DocV1 } from "my-doc/v1";
import { type MyDoc as DocV2 } from "my-doc/v2";

export type UpgradeReducer = (
  document: DocV1,
  action: Action,
  dispatch?: SignalDispatch,
  options?: ReducerOptions,
) => DocV2;
```

### Document Model Package

Each document model NPM package contains all the code necessary to move from version to version. This means that it must include multiple versions of the same model.

### Supported Versions

The `[IReactor](../Reactor/interface.md)` interface provides a `getDocumentModels` method that returns `DocumentModelState` objects. These objects contain a list of supported versions for a given document model.
