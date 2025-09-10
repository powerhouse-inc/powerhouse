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

- Create an `Operation` for the `CREATE_DOCUMENT` action. This will result in the creation of a new document with a filled out `header` scope but an empty, `{}`, default scope (`document`).

- Create an `Operation` for the `UPGRADE_DOCUMENT` action. This will result in a document with a state object of `{ title: "My Todo List" }`, in the default scope (`document`).

### Document Model Upgrade Flow

For documents that already exist, we provide a specific upgrade flow. This requires:

- Named `Action`s for each version upgrade.
- Update specific reducers.

#### Upgrade Reducer

Upgrade reducers are a special type of reducer that are used to upgrade a document from one version to another.

```tsx
export type UpgradeReducer<TDocument extends PHDocument> = <
  TAction extends UpgradeActionFromDocument<TDocument>,
>(
  document: VersionedDocument<TDocument>,
  action: TAction,
  dispatch?: SignalDispatch,
  options?: ReducerOptions,
) => TDocument;
```

These accept a `VersionedDocument` instead of a `PHDocument`, which contain side-by-side versions of the same document.

### Document Model Package

Each document model NPM package contains all the code necessary to move from version to version. This means that it must include multiple versions of the same model.

### Supported Versions

The `[IReactor](../Reactor/interface.md)` interface provides a `getDocumentModels` method that returns `DocumentModelState` objects. These objects contain a list of supported versions for a given document model.
