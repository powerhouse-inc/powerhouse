---
toc_max_heading_level: 3
---

# IReactorClient

The `IReactorClient` interface is the primary way to interact with a Powerhouse reactor programmatically. It wraps lower-level APIs to provide a simpler, Promise-based interface for document operations.

```typescript
import type { IReactorClient } from "@powerhousedao/reactor-browser";
```

:::info Import paths
`@powerhousedao/reactor-browser` re-exports all reactor types for convenience in browser environments (editors, drive-apps, subgraphs). If you are working outside the browser — for example in a standalone Node.js script, CLI tool, or server-side processor — import directly from `@powerhousedao/reactor`.
:::

For an architectural overview of the reactor, see [Working with the Reactor](/academy/Architecture/WorkingWithTheReactor). For the low-level `IReactor` interface and access to internal components, see [Advanced Reactor Usage](/academy/APIReferences/AdvancedReactorUsage).

## Common parameter types

Several types appear across multiple methods. They are described here once.

### `ViewFilter`

Targets a specific branch, scopes, or revision when reading documents.

```typescript
type ViewFilter = {
  branch?: string;
  scopes?: string[];
  revision?: number;
};
```

| Field      | Description                                     |
| ---------- | ----------------------------------------------- |
| `branch`   | The branch to read from (e.g. `"main"`)         |
| `scopes`   | Scopes to include (e.g. `["global"]`)           |
| `revision` | Read the document at a specific revision number |

### `SearchFilter`

Narrows which documents a query returns.

```typescript
type SearchFilter = {
  type?: string;
  parentId?: string;
  ids?: string[];
  slugs?: string[];
};
```

### `PagingOptions`

Controls pagination for list methods.

```typescript
type PagingOptions = {
  cursor: string;
  limit: number;
};
```

### `PagedResults<T>`

Returned by all list methods. Includes a `next()` helper for fetching the next page.

```typescript
type PagedResults<T> = {
  results: T[];
  options: PagingOptions;
  next?: () => Promise<PagedResults<T>>;
  nextCursor?: string;
  totalCount?: number;
};
```

### `PropagationMode`

Controls how deletions handle child documents.

```typescript
enum PropagationMode {
  None = "none", // Only delete the specified document
  Cascade = "cascade", // Also delete all child documents
}
```

### `CreateDocumentOptions`

Options for `createEmpty()`.

```typescript
type CreateDocumentOptions = {
  parentIdentifier?: string; // id or slug of parent document
  documentModelVersion?: number; // defaults to latest
};
```

### `JobInfo`

Tracks the status and result of a mutation job.

```typescript
type JobInfo = {
  id: string;
  status: JobStatus;
  createdAtUtcIso: string;
  completedAtUtcIso?: string;
  error?: ErrorInfo;
  consistencyToken: ConsistencyToken;
  meta: JobMeta;
};
```

See [Job lifecycle](/academy/Architecture/WorkingWithTheReactor#job-lifecycle) for details on `JobStatus` values.

---

## Pagination best practices

All list methods (`find`, `getChildren`, `getParents`, `getOperations`, `getDocumentModelModules`) accept `PagingOptions` and return `PagedResults<T>`. Here are some guidelines for working with paginated results effectively.

**Use `next()` for sequential iteration.** The `next()` helper on `PagedResults` handles cursor management for you:

```typescript
let page = await reactorClient.find({ type: "powerhouse/todo-list" });

while (page) {
  for (const doc of page.results) {
    console.log(doc.header.id);
  }
  page = page.next ? await page.next() : undefined;
}
```

**Set a reasonable `limit`.** The default page size varies by method. If you know you only need a few results, set a small limit to reduce response size:

```typescript
const topFive = await reactorClient.getChildren(driveId, undefined, {
  cursor: "",
  limit: 5,
});
```

**Check `nextCursor` to know if more pages exist.** When `nextCursor` is `undefined`, you have reached the end:

```typescript
const page = await reactorClient.getOperations(docId);
if (page.nextCursor) {
  // There are more operations to fetch
}
```

**Avoid fetching all pages in tight loops for large datasets.** If you are processing thousands of documents or operations, consider processing each page before fetching the next to keep memory usage predictable.

---

## Cancellation with AbortSignal

Most `IReactorClient` methods accept an optional `AbortSignal` parameter. This lets you cancel in-flight requests — useful for cleaning up when a component unmounts, a user navigates away, or a timeout is reached.

**Cancel on component unmount (React):**

```typescript
useEffect(() => {
  const controller = new AbortController();

  reactorClient
    .find(
      { type: "powerhouse/todo-list" },
      undefined,
      undefined,
      controller.signal,
    )
    .then(setResults)
    .catch((err) => {
      if (err.name !== "AbortError") throw err;
    });

  return () => controller.abort();
}, []);
```

**Cancel with a timeout:**

```typescript
const result = await reactorClient.get(
  docId,
  undefined,
  AbortSignal.timeout(5000),
);
```

**Cancel long-running writes.** Write methods like `execute()` wait for the job to reach `READ_READY`. If this takes too long, an abort signal lets you bail out:

```typescript
const controller = new AbortController();

// Set a 10-second deadline
setTimeout(() => controller.abort(), 10_000);

const updated = await reactorClient.execute(
  docId,
  "main",
  actions,
  controller.signal,
);
```

When a request is aborted, the method throws an `AbortError`. The underlying reactor job may still complete — aborting only cancels the client-side wait, not the server-side processing.

---

## Read methods

### `get`

Retrieve a single document by id or slug.

```typescript
get<TDocument extends PHDocument>(
  identifier: string,
  view?: ViewFilter,
  signal?: AbortSignal,
): Promise<TDocument>
```

**Parameters:**

| Name         | Type          | Required | Description                        |
| ------------ | ------------- | -------- | ---------------------------------- |
| `identifier` | `string`      | Yes      | Document id or slug                |
| `view`       | `ViewFilter`  | No       | Branch, scopes, or revision filter |
| `signal`     | `AbortSignal` | No       | Cancel the request                 |

**Example:**

```typescript
const doc = await reactorClient.get("my-todo-list");
const atRevision = await reactorClient.get("my-todo-list", { revision: 5 });
```

---

### `getChildren`

List child documents of a parent.

```typescript
getChildren(
  parentIdentifier: string,
  view?: ViewFilter,
  paging?: PagingOptions,
  signal?: AbortSignal,
): Promise<PagedResults<PHDocument>>
```

**Parameters:**

| Name               | Type            | Required | Description                 |
| ------------------ | --------------- | -------- | --------------------------- |
| `parentIdentifier` | `string`        | Yes      | Parent document id or slug  |
| `view`             | `ViewFilter`    | No       | Branch/scopes filter        |
| `paging`           | `PagingOptions` | No       | Pagination cursor and limit |
| `signal`           | `AbortSignal`   | No       | Cancel the request          |

---

### `getParents`

List parent documents of a child.

```typescript
getParents(
  childIdentifier: string,
  view?: ViewFilter,
  paging?: PagingOptions,
  signal?: AbortSignal,
): Promise<PagedResults<PHDocument>>
```

**Parameters:**

| Name              | Type            | Required | Description                 |
| ----------------- | --------------- | -------- | --------------------------- |
| `childIdentifier` | `string`        | Yes      | Child document id or slug   |
| `view`            | `ViewFilter`    | No       | Branch/scopes filter        |
| `paging`          | `PagingOptions` | No       | Pagination cursor and limit |
| `signal`          | `AbortSignal`   | No       | Cancel the request          |

---

### `find`

Search for documents matching criteria.

```typescript
find(
  search: SearchFilter,
  view?: ViewFilter,
  paging?: PagingOptions,
  signal?: AbortSignal,
): Promise<PagedResults<PHDocument>>
```

**Parameters:**

| Name     | Type            | Required | Description                             |
| -------- | --------------- | -------- | --------------------------------------- |
| `search` | `SearchFilter`  | Yes      | Filter by type, parentId, ids, or slugs |
| `view`   | `ViewFilter`    | No       | Branch/scopes filter                    |
| `paging` | `PagingOptions` | No       | Pagination cursor and limit             |
| `signal` | `AbortSignal`   | No       | Cancel the request                      |

**Example:**

```typescript
const todoLists = await reactorClient.find({
  type: "powerhouse/todo-list",
  parentId: driveId,
});

for (const doc of todoLists.results) {
  console.log(doc.header.id, doc.header.name);
}
```

---

### `getOperations`

Retrieve the operation history of a document.

```typescript
getOperations(
  documentIdentifier: string,
  view?: ViewFilter,
  filter?: OperationFilter,
  paging?: PagingOptions,
  signal?: AbortSignal,
): Promise<PagedResults<Operation>>
```

**Parameters:**

| Name                 | Type              | Required | Description                                     |
| -------------------- | ----------------- | -------- | ----------------------------------------------- |
| `documentIdentifier` | `string`          | Yes      | Document id or slug                             |
| `view`               | `ViewFilter`      | No       | Branch/scopes filter                            |
| `filter`             | `OperationFilter` | No       | Filter by action types, timestamps, or revision |
| `paging`             | `PagingOptions`   | No       | Pagination cursor and limit                     |
| `signal`             | `AbortSignal`     | No       | Cancel the request                              |

**`OperationFilter`:**

```typescript
interface OperationFilter {
  actionTypes?: string[]; // e.g. ["ADD_TODO_ITEM"]
  timestampFrom?: string; // ISO string
  timestampTo?: string; // ISO string
  sinceRevision?: number; // operations with index >= this value
}
```

---

### `getDocumentModelModules`

List registered document model modules.

```typescript
getDocumentModelModules(
  namespace?: string,
  paging?: PagingOptions,
  signal?: AbortSignal,
): Promise<PagedResults<DocumentModelModule>>
```

**Parameters:**

| Name        | Type            | Required | Description                                        |
| ----------- | --------------- | -------- | -------------------------------------------------- |
| `namespace` | `string`        | No       | Filter by namespace (e.g. `"powerhouse"`, `"sky"`) |
| `paging`    | `PagingOptions` | No       | Pagination cursor and limit                        |
| `signal`    | `AbortSignal`   | No       | Cancel the request                                 |

---

### `getDocumentModelModule`

Get a specific document model module by document type.

```typescript
getDocumentModelModule(
  documentType: string,
): Promise<DocumentModelModule>
```

**Parameters:**

| Name           | Type     | Required | Description                   |
| -------------- | -------- | -------- | ----------------------------- |
| `documentType` | `string` | Yes      | e.g. `"powerhouse/todo-list"` |

---

## Write methods

All write methods internally create jobs and wait for them to reach `READ_READY` before resolving (except `executeAsync` which returns immediately).

### `create`

Create a document from a full `PHDocument` object.

```typescript
create<TDocument extends PHDocument>(
  document: PHDocument,
  parentIdentifier?: string,
  signal?: AbortSignal,
): Promise<TDocument>
```

**Parameters:**

| Name               | Type          | Required | Description                                              |
| ------------------ | ------------- | -------- | -------------------------------------------------------- |
| `document`         | `PHDocument`  | Yes      | Document with optional id, slug, type, and initial state |
| `parentIdentifier` | `string`      | No       | Id or slug of parent document                            |
| `signal`           | `AbortSignal` | No       | Cancel the request                                       |

---

### `createEmpty`

Create an empty document of a given type.

```typescript
createEmpty<TDocument extends PHDocument>(
  documentModelType: string,
  options?: CreateDocumentOptions,
  signal?: AbortSignal,
): Promise<TDocument>
```

**Parameters:**

| Name                | Type                    | Required | Description                            |
| ------------------- | ----------------------- | -------- | -------------------------------------- |
| `documentModelType` | `string`                | Yes      | e.g. `"powerhouse/todo-list"`          |
| `options`           | `CreateDocumentOptions` | No       | Parent identifier and/or model version |
| `signal`            | `AbortSignal`           | No       | Cancel the request                     |

---

### `createDocumentInDrive`

Create a document inside a drive as a single batched operation. More efficient than `createEmpty` followed by `addChildren` because all actions are batched into dependent jobs.

```typescript
createDocumentInDrive<TDocument extends PHDocument>(
  driveId: string,
  document: PHDocument,
  parentFolder?: string,
  signal?: AbortSignal,
): Promise<TDocument>
```

**Parameters:**

| Name           | Type          | Required | Description                |
| -------------- | ------------- | -------- | -------------------------- |
| `driveId`      | `string`      | Yes      | Drive document id or slug  |
| `document`     | `PHDocument`  | Yes      | The document to create     |
| `parentFolder` | `string`      | No       | Folder id within the drive |
| `signal`       | `AbortSignal` | No       | Cancel the request         |

---

### `execute`

Apply actions to a document and wait for completion.

```typescript
execute<TDocument extends PHDocument>(
  documentIdentifier: string,
  branch: string,
  actions: Action[],
  signal?: AbortSignal,
): Promise<TDocument>
```

**Parameters:**

| Name                 | Type          | Required | Description                                |
| -------------------- | ------------- | -------- | ------------------------------------------ |
| `documentIdentifier` | `string`      | Yes      | Document id or slug                        |
| `branch`             | `string`      | Yes      | Branch to apply actions to (e.g. `"main"`) |
| `actions`            | `Action[]`    | Yes      | List of actions to apply                   |
| `signal`             | `AbortSignal` | No       | Cancel the request                         |

**Returns** the updated document after all actions are applied and read models are updated.

**Example:**

```typescript
import { actions } from "my-package/document-models/todo-list";

const updated = await reactorClient.execute(docId, "main", [
  actions.addTodoItem({ text: "Buy groceries" }),
  actions.addTodoItem({ text: "Walk the dog" }),
]);
```

---

### `executeAsync`

Submit actions without waiting for completion. Returns a `JobInfo` at `PENDING` status.

```typescript
executeAsync(
  documentIdentifier: string,
  branch: string,
  actions: Action[],
  signal?: AbortSignal,
): Promise<JobInfo>
```

Use `waitForJob()` or `getJobStatus()` to track progress.

---

### `rename`

Rename a document.

```typescript
rename(
  documentIdentifier: string,
  name: string,
  branch?: string,
  signal?: AbortSignal,
): Promise<PHDocument>
```

**Parameters:**

| Name                 | Type          | Required | Description          |
| -------------------- | ------------- | -------- | -------------------- |
| `documentIdentifier` | `string`      | Yes      | Document id or slug  |
| `name`               | `string`      | Yes      | New name             |
| `branch`             | `string`      | No       | Defaults to `"main"` |
| `signal`             | `AbortSignal` | No       | Cancel the request   |

---

### `addChildren`

Add documents as children to a parent.

```typescript
addChildren(
  parentIdentifier: string,
  documentIdentifiers: string[],
  branch?: string,
  signal?: AbortSignal,
): Promise<PHDocument>
```

---

### `removeChildren`

Remove child relationships from a parent.

```typescript
removeChildren(
  parentIdentifier: string,
  documentIdentifiers: string[],
  branch?: string,
  signal?: AbortSignal,
): Promise<PHDocument>
```

---

### `moveChildren`

Move documents from one parent to another.

```typescript
moveChildren(
  sourceParentIdentifier: string,
  targetParentIdentifier: string,
  documentIdentifiers: string[],
  branch?: string,
  signal?: AbortSignal,
): Promise<{ source: PHDocument; target: PHDocument }>
```

---

### `deleteDocument`

Delete a single document.

```typescript
deleteDocument(
  identifier: string,
  propagate?: PropagationMode,
  signal?: AbortSignal,
): Promise<void>
```

**Parameters:**

| Name         | Type              | Required | Description                       |
| ------------ | ----------------- | -------- | --------------------------------- |
| `identifier` | `string`          | Yes      | Document id or slug               |
| `propagate`  | `PropagationMode` | No       | `Cascade` to also delete children |
| `signal`     | `AbortSignal`     | No       | Cancel the request                |

---

### `deleteDocuments`

Bulk delete multiple documents.

```typescript
deleteDocuments(
  identifiers: string[],
  propagate?: PropagationMode,
  signal?: AbortSignal,
): Promise<void>
```

---

## Subscriptions

### `subscribe`

Subscribe to document change events matching a filter.

```typescript
subscribe(
  search: SearchFilter,
  callback: (event: DocumentChangeEvent) => void,
  view?: ViewFilter,
): () => void
```

**Returns** an unsubscribe function.

**`DocumentChangeEvent`:**

```typescript
type DocumentChangeEvent = {
  type: DocumentChangeType;
  documents: PHDocument[];
  context?: {
    parentId?: string;
    childId?: string;
  };
};
```

**`DocumentChangeType`** values:

| Value           | Description                       |
| --------------- | --------------------------------- |
| `Created`       | A new document was created        |
| `Deleted`       | A document was deleted            |
| `Updated`       | A document's state changed        |
| `ParentAdded`   | A parent relationship was added   |
| `ParentRemoved` | A parent relationship was removed |
| `ChildAdded`    | A child relationship was added    |
| `ChildRemoved`  | A child relationship was removed  |

**Example:**

```typescript
// Watch for all todo-list changes
const unsubscribe = reactorClient.subscribe(
  { type: "powerhouse/todo-list" },
  (event) => {
    if (event.type === DocumentChangeType.Updated) {
      console.log(
        "Updated:",
        event.documents.map((d) => d.header.id),
      );
    }
  },
);

// Later, stop listening
unsubscribe();
```

---

## Job tracking

### `getJobStatus`

Check the current status of a job.

```typescript
getJobStatus(
  jobId: string,
  signal?: AbortSignal,
): Promise<JobInfo>
```

---

### `waitForJob`

Wait for a job to reach a terminal status (`READ_READY` or `FAILED`).

```typescript
waitForJob(
  jobId: string | JobInfo,
  signal?: AbortSignal,
): Promise<JobInfo>
```

**Example:**

```typescript
const job = await reactorClient.executeAsync(docId, "main", actions);
console.log(job.status); // "PENDING"

const completed = await reactorClient.waitForJob(job);
console.log(completed.status); // "READ_READY" or "FAILED"
```
