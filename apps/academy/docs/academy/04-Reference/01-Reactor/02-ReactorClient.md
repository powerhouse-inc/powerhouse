---
toc_max_heading_level: 3
---

# IReactorClient

The reactor client is the primary way to interact with a Powerhouse reactor programmatically. It comes in two halves:

- **`client.read`** (`IReactorReadClient`) answers from read models and never enqueues a job.
- **`client.write`** (`IReactorWriteClient`) enqueues jobs. Every write resolves once its job is accepted and returns a [`WriteHandle`](#writehandle) you await for the commit or the updated document.

`IReactorClient` carries both as `read` and `write`. It also exposes the read methods directly, so `client.get(...)` and `client.read.get(...)` are the same call. Write through `client.write`.

```typescript
import type {
  IReactorClient,
  IReactorReadClient,
  IReactorWriteClient,
  WriteHandle,
} from "@powerhousedao/reactor";
```

:::info[Import paths]
`@powerhousedao/reactor-browser` re-exports a curated subset of reactor values and types for browser environments (editors, drive-apps, subgraphs). `IReactorClient`, `IReactorReadClient`, `IReactorWriteClient`, `WriteHandle`, `WriteReceipt`, `DocumentChangeType`, `ReactorBuilder`, and `ReactorClientBuilder` are re-exported there. Most other types on this page are not re-exported and must come from `@powerhousedao/reactor`: `ViewFilter`, `SearchFilter`, `PagingOptions`, `PagedResults`, `PropagationMode`, `JobInfo`, `JobStatus`, `DocumentChangeEvent`, and `OperationFilter`. Outside the browser (a standalone Node.js script, CLI tool, or server-side processor), import everything from `@powerhousedao/reactor`.
:::

For an architectural overview of the reactor, see [Working with the Reactor](/academy/Reference/Reactor/WorkingWithTheReactor). For the low-level `IReactor` interface and access to internal components, see [Advanced Reactor Usage](/academy/Reference/Reactor/AdvancedReactorUsage).

## Common parameter types

Several types appear across multiple methods. They are described here once.

### `ViewFilter`

Targets a specific branch, scopes, or revision when reading documents, and names the subject the read is gated for.

```typescript
type ViewFilter = {
  branch?: string;
  scopes?: string[];
  revision?: number;
  subject?: AuthSubject;
};
```

| Field      | Description                                     |
| ---------- | ----------------------------------------------- |
| `branch`   | The branch to read from (e.g. `"main"`)         |
| `scopes`   | Scopes to include (e.g. `["global"]`)           |
| `revision` | Read the document at a specific revision number |
| `subject`  | Who the [read gate](/academy/Reference/Reactor/Authorization) decides for. Defaults to the client's signer. Set it per request when one client serves many principals. `IReactor` ignores it |

`AuthSubject` is `{ address?: string; key?: string }` from `document-model`. `address` is the verified signer address and `key` is the signer's `did:key`. Both are optional. An empty subject reads as anonymous.

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

### `NewDocumentOptions`

Options for `newDocument()` and `createEmpty()`.

```typescript
type NewDocumentOptions = {
  parentIdentifier?: string; // id or slug of parent document
  documentModelVersion?: number; // defaults to latest
  protocolVersions?: { [protocol: string]: number }; // merged over the selection
  signaturePolicy?: SignaturePolicy; // overrides the client's default
  initialState?: Partial<PHBaseState>; // passed to the model's createDocument
  name?: string;
  id?: string; // kept only under the legacy policy
};
```

### `JobInfo`

Tracks the status and result of a mutation job.

```typescript
type JobInfo = {
  id: string;
  documentId: string; // empty string when the job is unknown
  status: JobStatus;
  createdAtUtcIso: string;
  completedAtUtcIso?: string;
  error?: ErrorInfo;
  errorHistory?: ErrorInfo[];
  result?: any;
  consistencyToken: ConsistencyToken;
  meta: JobMeta;
  job?: Job; // populated on failure for debugging
};
```

See [Job lifecycle](/academy/Reference/Reactor/WorkingWithTheReactor#job-lifecycle) for details on `JobStatus` values.

---

## Pagination best practices

All list methods (`find`, `getOutgoingRelationships`, `getIncomingRelationships`, `getOperations`, `getDocumentModelModules`) accept `PagingOptions` and return `PagedResults<T>`. Here are some guidelines for working with paginated results effectively.

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
const topFive = await reactorClient.getOutgoingRelationships(
  driveId,
  "child",
  undefined,
  {
    cursor: "0",
    limit: 5,
  },
);
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

Most `IReactorClient` methods accept an optional `AbortSignal` parameter. This lets you cancel in-flight requests — useful for cleaning up when a component unmounts, a user navigates away, or a timeout is reached. The two methods that do not take an `AbortSignal` are `getDocumentModelModule` and `subscribe`.

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
      if (!isAbortError(err)) throw err; // isAbortError is exported from @powerhousedao/reactor
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

**Bound a write's stage waits.** A write resolves once its job is accepted, but awaiting `handle.readable` or `handle.document()` waits for `READ_READY`. Those waits are bounded by the signal the write was called with:

```typescript
const controller = new AbortController();

// Set a 10-second deadline
setTimeout(() => controller.abort(), 10_000);

const handle = await reactorClient.write.execute(
  docId,
  "main",
  actions,
  controller.signal,
);
const updated = await handle.document();
```

When a request is aborted, the method throws an `AbortError`. Detect it with `isAbortError(err)` from `@powerhousedao/reactor` rather than matching `err.name`. The underlying reactor job may still complete; aborting only cancels the client-side wait, not the server-side processing.

---

## Read methods (`client.read`)

Reads that accept a `consistencyToken` wait until the read models they read from hold every operation the token names. Pass the `token` from a write's [`WriteReceipt`](#writehandle) to read your own write on any instance serving the same store. The token is always the last parameter.

### `get`

Retrieve a single document by id or slug.

```typescript
get<TDocument extends PHDocument>(
  identifier: string,
  view?: ViewFilter,
  signal?: AbortSignal,
  consistencyToken?: ConsistencyToken,
): Promise<TDocument>
```

**Parameters:**

| Name               | Type               | Required | Description                         |
| ------------------ | ------------------ | -------- | ----------------------------------- |
| `identifier`       | `string`           | Yes      | Document id or slug                 |
| `view`             | `ViewFilter`       | No       | Branch, scopes, or revision filter  |
| `signal`           | `AbortSignal`      | No       | Cancel the request                  |
| `consistencyToken` | `ConsistencyToken` | No       | Wait until the read models hold it  |

`getMany(documentIds, view?, signal?, consistencyToken?)` reads several documents by id in one call.

**Example:**

```typescript
const doc = await reactorClient.get("my-todo-list");
const atRevision = await reactorClient.get("my-todo-list", { revision: 5 });
```

---

### `resolveIdOrSlug`

Resolve an id or slug to the canonical document id. Resolution runs against the `main` branch. Throws if the identifier cannot be resolved or is ambiguous.

```typescript
resolveIdOrSlug(
  identifier: string,
  view?: ViewFilter,
  signal?: AbortSignal,
  consistencyToken?: ConsistencyToken,
): Promise<string>
```

**Parameters:**

| Name               | Type               | Required | Description                        |
| ------------------ | ------------------ | -------- | ---------------------------------- |
| `identifier`       | `string`           | Yes      | Document id or slug                |
| `view`             | `ViewFilter`       | No       | Branch/scopes filter               |
| `signal`           | `AbortSignal`      | No       | Cancel the request                 |
| `consistencyToken` | `ConsistencyToken` | No       | Wait until the read models hold it |

---

### `getOutgoingRelationships`

List documents that the given source has outgoing relationships to, filtered by relationship type. For example, pass `"child"` to list a parent's children.

```typescript
getOutgoingRelationships(
  sourceIdentifier: string,
  relationshipType: string,
  view?: ViewFilter,
  paging?: PagingOptions,
  signal?: AbortSignal,
  consistencyToken?: ConsistencyToken,
): Promise<PagedResults<PHDocument>>
```

**Parameters:**

| Name               | Type            | Required | Description                                     |
| ------------------ | --------------- | -------- | ----------------------------------------------- |
| `sourceIdentifier` | `string`        | Yes      | Source document id or slug                      |
| `relationshipType` | `string`        | Yes      | Relationship type to filter by (e.g. `"child"`) |
| `view`             | `ViewFilter`    | No       | Branch/scopes filter                            |
| `paging`           | `PagingOptions` | No       | Pagination cursor and limit                     |
| `signal`           | `AbortSignal`   | No       | Cancel the request                              |
| `consistencyToken` | `ConsistencyToken` | No    | Wait until the read models hold it              |

---

### `getIncomingRelationships`

List documents that have incoming relationships pointing at the given target, filtered by relationship type. For example, pass `"child"` to list a document's parents.

```typescript
getIncomingRelationships(
  targetIdentifier: string,
  relationshipType: string,
  view?: ViewFilter,
  paging?: PagingOptions,
  signal?: AbortSignal,
  consistencyToken?: ConsistencyToken,
): Promise<PagedResults<PHDocument>>
```

**Parameters:**

| Name               | Type            | Required | Description                                     |
| ------------------ | --------------- | -------- | ----------------------------------------------- |
| `targetIdentifier` | `string`        | Yes      | Target document id or slug                      |
| `relationshipType` | `string`        | Yes      | Relationship type to filter by (e.g. `"child"`) |
| `view`             | `ViewFilter`    | No       | Branch/scopes filter                            |
| `paging`           | `PagingOptions` | No       | Pagination cursor and limit                     |
| `signal`           | `AbortSignal`   | No       | Cancel the request                              |
| `consistencyToken` | `ConsistencyToken` | No    | Wait until the read models hold it              |

---

### `find`

Search for documents matching criteria.

```typescript
find(
  search: SearchFilter,
  view?: ViewFilter,
  paging?: PagingOptions,
  signal?: AbortSignal,
  consistencyToken?: ConsistencyToken,
): Promise<PagedResults<PHDocument>>
```

**Parameters:**

| Name     | Type            | Required | Description                             |
| -------- | --------------- | -------- | --------------------------------------- |
| `search` | `SearchFilter`  | Yes      | Filter by type, parentId, ids, or slugs |
| `view`   | `ViewFilter`    | No       | Branch/scopes filter                    |
| `paging` | `PagingOptions` | No       | Pagination cursor and limit             |
| `signal` | `AbortSignal`   | No       | Cancel the request                      |
| `consistencyToken` | `ConsistencyToken` | No | Wait until the read models hold it |

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

`getOperations` merges operations across all of the document's scopes and sorts them by operation index, paging through them with a composite cursor that tracks each scope's position. Paging defaults to `{ cursor: "0", limit: 100 }` — the default cursor is `"0"`, not `""`.

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
): Promise<DocumentModelModule<any>>
```

**Parameters:**

| Name           | Type     | Required | Description                   |
| -------------- | -------- | -------- | ----------------------------- |
| `documentType` | `string` | Yes      | e.g. `"powerhouse/todo-list"` |

---

### `newDocument`

Head a new, uncreated document of a type with the protocol versions this client selects for it and its parent, and the client's create signature policy. It is the one place a client chooses a new document's versions; pass the result to `client.write.create` or `client.write.drives.addFile`. It builds the header and enqueues nothing, so it is on the read half: `client.read.newDocument(...)`, or `client.newDocument(...)`.

```typescript
newDocument<TDocument extends PHDocument = PHDocument>(
  documentType: string,
  options?: NewDocumentOptions,
  signal?: AbortSignal,
): Promise<TDocument>
```

---

### `evaluateActions`

On `client.write`: it is a write-side read that decides through the same model that admits a write. Ask what the reactor **would** decide about a set of candidate operations, without submitting any of them. Use it to disable a control rather than offer an action that fails on submit.

```typescript
evaluateActions(
  documentIdentifier: string,
  branch: string,
  candidates: ActionCandidate[],
  subject?: AuthSubject,
  signal?: AbortSignal,
): Promise<ActionEvaluations>
```

**Parameters:**

| Name                 | Type                | Required | Description                                            |
| -------------------- | ------------------- | -------- | ------------------------------------------------------ |
| `documentIdentifier` | `string`            | Yes      | Document id or slug the candidates target              |
| `branch`             | `string`            | Yes      | Branch to evaluate against                             |
| `candidates`         | `ActionCandidate[]` | Yes      | Operations to predict a verdict for                    |
| `subject`            | `AuthSubject`       | No       | Who to decide for; defaults to the client's own signer |
| `signal`             | `AbortSignal`       | No       | Cancel the request                                     |

**`ActionCandidate` and `ActionEvaluations`:**

```typescript
interface ActionCandidate {
  scope: string; // the scope the operation would execute in
  type: string; // the action type, e.g. "SUBMIT_EXPENSE"
  input?: unknown; // the action input, when a grant depends on it
}

interface ActionEvaluations {
  evaluations: Evaluation[]; // one per candidate, in the order given
  allAllowed: boolean;
  anyAllowed: boolean;
  allDenied: boolean;
  anyDenied: boolean;
}

type Evaluation =
  | { decision: "allow" }
  | { decision: "deny"; reason: string };
```

A denial's `reason` is the same string the reactor would record on the refused operation, so a control can explain itself rather than going grey with no reason. Over an empty candidate list every aggregate is `false`: nothing asked about is nothing allowed *and* nothing denied.

```typescript
const answer = await client.write.evaluateActions(documentId, "main", [
  { scope: "global", type: "SUBMIT_EXPENSE", input: { amountCents: 900 } },
  { scope: "global", type: "APPROVE_EXPENSE", input: { id: "e1" } },
]);

submitButton.disabled = answer.evaluations[0].decision === "deny";
```

:::warning[The answer is a prediction, not a promise]
`evaluateActions` decides through the same model that admits a real write, but it reads no future. A policy change landing between the answer and the submit changes the verdict, so **the submit path stays the only authority** — keep handling the refusal when you write. Treat an allow as "worth offering", never as "will succeed".
:::

Three further contract details are worth knowing:

- **Supply the input when a grant depends on it.** With `authConditions` enabled, a conditional grant reads `action.input`, so a candidate standing for a half-filled form predicts the verdict a half-filled form earns — not the verdict the completed form will get.
- **Document-scope candidates are judged by the document they name.** `DELETE_DOCUMENT` and `UPGRADE_DOCUMENT` name their target in `input.documentId`, the relationship actions in `input.sourceId`, and the policy consulted is that document's rather than the one passed as `documentIdentifier`. `CREATE_DOCUMENT` is exempt, matching the executor: it runs before its document exists, so it always predicts allow.
- **The verdict is evaluated at the stream heads.** That is correct for a candidate about to be submitted. A backdated submission is out of contract, because the reactor decides that one by position against the policy as it stood there.

**Requires the `authEnforcement` feature flag.** Without it the reactor holds no decision model and there is nothing to answer from, so the call rejects with `AuthEnforcementDisabledError`. Treat that as "cannot know" and leave your controls as they were — reading it as a denial would disable every control on a deployment that never enabled enforcement. Detect it by name, which is all that survives the SharedWorker RPC boundary:

```typescript
import { AuthEnforcementDisabledError } from "@powerhousedao/reactor";

if (AuthEnforcementDisabledError.isError(error)) {
  // no verdict available here; render as if unasked
}
```

In React, prefer the [`useCanExecute`](/academy/Reference/EditorsUI/ReactHooks) hook, which wraps this call and reports the flags-off case as `status: "unsupported"`. Over GraphQL the same question is the `evaluateActions` query on the reactor subgraph, which decides for the authenticated caller and answers the flags-off case with an `AUTH_EVALUATION_UNSUPPORTED` error code.

---

## Write methods (`client.write`)

The write half is `IReactorWriteClient`. Every write resolves once its job is accepted (validated, signed and enqueued) and returns a [`WriteHandle`](#writehandle). Nothing waits for the commit unless you await one of the handle's stages.

```typescript
const handle = await client.write.execute(docId, "main", actions);
const { token } = await handle.written; // operations are in the log
const doc = await client.read.get(docId, undefined, undefined, token);
const same = await handle.document(); // readable, then the gated read-back
```

### `WriteHandle`

```typescript
interface WriteHandle {
  readonly jobId: string;
  readonly documentId: string; // for a create, the id the new document carries
  readonly branch: string;
  readonly written: Promise<WriteReceipt>; // job reached WRITE_READY
  readonly readable: Promise<WriteReceipt>; // job reached READ_READY
  document<TDocument extends PHDocument = PHDocument>(
    view?: ViewFilter,
    signal?: AbortSignal,
  ): Promise<TDocument>;
}

type WriteReceipt = {
  job: JobInfo;
  token: ConsistencyToken; // pass to a read to bound it
  documentId: string;
  branch: string;
};
```

`written` and `readable` reject with `JobFailedError` (exported from `@powerhousedao/reactor`, with the failed `JobInfo` on `job`) only when the job itself failed. A reducer error is not a job failure: the operation is stored with its error, the job reaches `READ_READY`, and `receipt.job.result` says which actions erred. `document()` awaits `readable`, then reads the target with the receipt's token, gated as the writer or as `view.subject` when given. Stage waits are bounded by the signal the write was called with.

---

### `create`

Create a document from a full `PHDocument` object. Its header's signature policy, id and protocol versions are taken as given; a header from a model's `utils.createDocument()` is created at base-reducer 2. Build the header with [`newDocument`](#newdocument). With a parent, the handle's stages also wait for the relationship job on the parent.

```typescript
create(
  document: PHDocument,
  parentIdentifier?: string,
  signal?: AbortSignal,
): Promise<WriteHandle>
```

**Parameters:**

| Name               | Type          | Required | Description                                              |
| ------------------ | ------------- | -------- | -------------------------------------------------------- |
| `document`         | `PHDocument`  | Yes      | Document with optional id, slug, type, and initial state |
| `parentIdentifier` | `string`      | No       | Id or slug of parent document                            |
| `signal`           | `AbortSignal` | No       | Cancel the request                                       |

---

### `createEmpty`

Create the document [`newDocument`](#newdocument) builds.

```typescript
createEmpty(
  documentModelType: string,
  options?: NewDocumentOptions,
  signal?: AbortSignal,
): Promise<WriteHandle>
```

**Parameters:**

| Name                | Type                    | Required | Description                            |
| ------------------- | ----------------------- | -------- | -------------------------------------- |
| `documentModelType` | `string`                | Yes      | e.g. `"powerhouse/todo-list"`          |
| `options`           | `NewDocumentOptions`    | No       | Parent identifier, model version and the rest of `newDocument`'s options |
| `signal`            | `AbortSignal`           | No       | Cancel the request                     |

---

### Creating a document in a drive

To create a document inside a drive, use `client.write.drives.addFile`. It submits the document's CREATE_DOCUMENT, UPGRADE_DOCUMENT, and ADD_RELATIONSHIP batch, waits for it to complete, then submits the drive's ADD_FILE. See [Drives](#drives) for the full signature.

---

### `execute`

Sign and submit actions on one document.

```typescript
execute(
  documentIdentifier: string,
  branch: string,
  actions: Action[],
  signal?: AbortSignal,
): Promise<WriteHandle>
```

**Parameters:**

| Name                 | Type          | Required | Description                                |
| -------------------- | ------------- | -------- | ------------------------------------------ |
| `documentIdentifier` | `string`      | Yes      | Document id or slug                        |
| `branch`             | `string`      | Yes      | Branch to apply actions to (e.g. `"main"`) |
| `actions`            | `Action[]`    | Yes      | List of actions to apply                   |
| `signal`             | `AbortSignal` | No       | Cancel the request                         |

**Example:**

```typescript
import { actions } from "my-package/document-models/todo-list";

const handle = await client.write.execute(docId, "main", [
  actions.addTodoItem({ text: "Buy groceries" }),
  actions.addTodoItem({ text: "Walk the dog" }),
]);
const updated = await handle.document();
```

The write half has no `executeAsync`: `execute` already returns as soon as the job is accepted. Use `handle.jobId` with `waitForJob()` or `getJobStatus()` when you need the raw `JobInfo`.

---

### `rename`

Rename a document.

```typescript
rename(
  documentIdentifier: string,
  name: string,
  branch?: string,
  signal?: AbortSignal,
): Promise<WriteHandle>
```

**Parameters:**

| Name                 | Type          | Required | Description          |
| -------------------- | ------------- | -------- | -------------------- |
| `documentIdentifier` | `string`      | Yes      | Document id or slug  |
| `name`               | `string`      | Yes      | New name             |
| `branch`             | `string`      | No       | Defaults to `"main"` |
| `signal`             | `AbortSignal` | No       | Cancel the request   |

---

### `setPreferredEditor`

Update the preferred editor recorded in the document header meta. Pass `null` to clear it.

```typescript
setPreferredEditor(
  documentIdentifier: string,
  preferredEditor: string | null,
  branch?: string,
  signal?: AbortSignal,
): Promise<WriteHandle>
```

**Parameters:**

| Name                 | Type             | Required | Description                       |
| -------------------- | ---------------- | -------- | --------------------------------- |
| `documentIdentifier` | `string`         | Yes      | Document id or slug               |
| `preferredEditor`    | `string \| null` | Yes      | Editor id, or `null` to clear it  |
| `branch`             | `string`         | No       | Defaults to `"main"`              |
| `signal`             | `AbortSignal`    | No       | Cancel the request                |

---

### `addRelationship`

Add a typed relationship from a source document to a target document. To add a child, pass `"child"` as the `relationshipType`. The handle's document is the source.

```typescript
addRelationship(
  sourceIdentifier: string,
  targetIdentifier: string,
  relationshipType: string,
  metadata?: Record<string, unknown>,
  branch?: string,
  signal?: AbortSignal,
): Promise<WriteHandle>
```

**Parameters:**

| Name               | Type                      | Required | Description                        |
| ------------------ | ------------------------- | -------- | ---------------------------------- |
| `sourceIdentifier` | `string`                  | Yes      | Source document id or slug         |
| `targetIdentifier` | `string`                  | Yes      | Target document id or slug         |
| `relationshipType` | `string`                  | Yes      | Relationship type (e.g. `"child"`) |
| `metadata`         | `Record<string, unknown>` | No       | Metadata stored on the edge        |
| `branch`           | `string`                  | No       | Defaults to `"main"`               |
| `signal`           | `AbortSignal`             | No       | Cancel the request                 |

---

### `updateRelationship`

Replace the metadata on an existing edge. Pass `null` to clear it. Throws `RelationshipNotFoundError` before submitting when the edge does not exist. The handle's document is the source.

```typescript
updateRelationship(
  sourceIdentifier: string,
  targetIdentifier: string,
  relationshipType: string,
  metadata: Record<string, unknown> | null,
  branch?: string,
  signal?: AbortSignal,
): Promise<WriteHandle>
```

---

### `removeRelationship`

Remove a typed relationship from a source document to a target document. The handle's document is the source.

```typescript
removeRelationship(
  sourceIdentifier: string,
  targetIdentifier: string,
  relationshipType: string,
  branch?: string,
  signal?: AbortSignal,
): Promise<WriteHandle>
```

**Parameters:**

| Name               | Type          | Required | Description                        |
| ------------------ | ------------- | -------- | ---------------------------------- |
| `sourceIdentifier` | `string`      | Yes      | Source document id or slug         |
| `targetIdentifier` | `string`      | Yes      | Target document id or slug         |
| `relationshipType` | `string`      | Yes      | Relationship type (e.g. `"child"`) |
| `branch`           | `string`      | No       | Defaults to `"main"`               |
| `signal`           | `AbortSignal` | No       | Cancel the request                 |

---

### `moveRelationship`

Move a typed relationship from one source document to another, keeping the same target. A move is a remove followed by an add. The remove has reached `READ_READY` when the call resolves; the add has only been accepted.

```typescript
moveRelationship(
  sourceParentIdentifier: string,
  targetParentIdentifier: string,
  targetIdentifier: string,
  relationshipType: string,
  branch?: string,
  signal?: AbortSignal,
): Promise<{ removed: WriteHandle; added: WriteHandle }>
```

**Parameters:**

| Name                     | Type          | Required | Description                        |
| ------------------------ | ------------- | -------- | ---------------------------------- |
| `sourceParentIdentifier` | `string`      | Yes      | Current source document id or slug |
| `targetParentIdentifier` | `string`      | Yes      | New source document id or slug     |
| `targetIdentifier`       | `string`      | Yes      | The target document id or slug     |
| `relationshipType`       | `string`      | Yes      | Relationship type (e.g. `"child"`) |
| `branch`                 | `string`      | No       | Defaults to `"main"`               |
| `signal`                 | `AbortSignal` | No       | Cancel the request                 |

`removed.document()` reads the old parent; `added.document()` reads the new one.

---

### `deleteDocument`

Delete a single document. The delete, its incoming relationship removals and, with `Cascade`, every orphaned descendant go in one batch. The handle's stages wait for the whole batch.

```typescript
deleteDocument(
  identifier: string,
  propagate?: PropagationMode,
  signal?: AbortSignal,
): Promise<WriteHandle>
```

**Parameters:**

| Name         | Type              | Required | Description                       |
| ------------ | ----------------- | -------- | --------------------------------- |
| `identifier` | `string`          | Yes      | Document id or slug               |
| `propagate`  | `PropagationMode` | No       | `Cascade` to also delete children |
| `signal`     | `AbortSignal`     | No       | Cancel the request                |

---

### `deleteDocuments`

Bulk delete multiple documents. Returns one handle per identifier.

```typescript
deleteDocuments(
  identifiers: string[],
  propagate?: PropagationMode,
  signal?: AbortSignal,
): Promise<WriteHandle[]>
```

---

### `executeBatch`

Sign and submit multiple mutation jobs in dependency order. The call resolves once every job is accepted. Each batch stage waits for every job, then rejects with a `BatchJobFailedError` naming the first failed job's plan key (`key`), carrying every job's final `JobInfo` (`jobs`) and the failed job's own error name (`cause.name`). The batch is not atomic: other jobs, including ones that depend on the failed job, may still have committed. See [Error Handling](/academy/Reference/Reactor/ErrorHandling).

```typescript
executeBatch(
  request: BatchExecutionRequest,
  signal?: AbortSignal,
): Promise<BatchWriteHandle>
```

Each job carries a `key` (used to express dependencies) and a `dependsOn` list of other job keys.

```typescript
type ExecutionJobPlan = {
  key: string;
  documentId: string;
  scope: string;
  branch: string;
  actions: Action[];
  dependsOn: string[];
};

type BatchExecutionRequest = {
  jobs: ExecutionJobPlan[];
};

interface BatchWriteHandle {
  readonly jobs: Record<string, JobInfo>; // the accepted jobs
  readonly handles: Record<string, WriteHandle>;
  readonly written: Promise<Record<string, WriteReceipt>>;
  readonly readable: Promise<Record<string, WriteReceipt>>;
}
```

Every record is keyed by each plan's `key`.

---

### `loadBatch`

Submit multiple batches of pre-existing operations across documents, with dependency ordering, and wait for all jobs to complete. Use this to load operations that already exist (for example from sync), as opposed to `executeBatch`, which signs and applies new actions. Unlike the other writes, it keeps its job-map result.

```typescript
loadBatch(
  request: BatchLoadRequest,
  signal?: AbortSignal,
): Promise<BatchLoadResult>
```

Each job carries `operations` instead of actions. `dependsOn` lists intra-batch plan keys; `externalDeps` lists already-resolved job ids from prior batches.

```typescript
type LoadJobPlan = {
  key: string;
  documentId: string;
  scope: string;
  branch: string;
  operations: Operation[];
  dependsOn: string[];
  externalDeps: string[];
};

type BatchLoadRequest = {
  jobs: LoadJobPlan[];
};

type BatchLoadResult = {
  jobs: Record<string, JobInfo>;
};
```

The result's `jobs` record is keyed by each plan's `key`. If a job fails, `loadBatch` throws with that job's error message.

---

## Drives

Drive-aware operations orchestrate the multi-action, multi-document work needed to keep a drive's `state.global.nodes` array consistent with the relationship index and the underlying documents. Reads live on `client.read.drives` (`IDriveReadClient`); writes live on `client.write.drives` (`IDriveWriteClient`). Use the flat methods (`read.get`, `write.execute`, `read.find`) for everything that is not drive-aware.

Every method takes a trailing optional `signal?: AbortSignal`. Each write resolves once its last step is accepted. A step a later step depends on (a file's document before the drive names it, a document rename before the node rename) has completed by then; if it failed, the call throws the job's own error, by name.

### `write.drives.addFile`

Add a document to a drive. The document's CREATE_DOCUMENT, UPGRADE_DOCUMENT, and ADD_RELATIONSHIP batch completes first, then the drive's ADD_FILE is submitted. This is the way to create a document in a drive. The handle's document is the new file; its stages span both batches.

```typescript
addFile(
  driveIdentifier: string,
  document: PHDocument,
  parentFolder?: string,
  signal?: AbortSignal,
): Promise<WriteHandle>
```

**Parameters:**

| Name              | Type          | Required | Description                |
| ----------------- | ------------- | -------- | -------------------------- |
| `driveIdentifier` | `string`      | Yes      | Drive document id or slug  |
| `document`        | `PHDocument`  | Yes      | The document to create     |
| `parentFolder`    | `string`      | No       | Folder id within the drive |
| `signal`          | `AbortSignal` | No       | Cancel the request         |

### `write.drives.create`

Create a new drive document. The handle's document is the drive.

```typescript
create(
  input: DriveInput,
  signal?: AbortSignal,
): Promise<WriteHandle>
```

### `write.drives.addFolder`

Add a folder node to a drive. `nodeId` on the returned handle is the new folder's id.

```typescript
addFolder(
  driveIdentifier: string,
  name: string,
  parentFolder?: string,
  signal?: AbortSignal,
): Promise<NodeWriteHandle> // WriteHandle & { nodeId: string }
```

### `write.drives.removeNode`

Remove a node from a drive. Folder nodes cascade: descendant file documents are deleted first (each completed), then the folder node entry. The handle is the last step; its document is the drive.

```typescript
removeNode(
  driveIdentifier: string,
  nodeId: string,
  signal?: AbortSignal,
): Promise<WriteHandle>
```

### `write.drives.renameNode`

Rename a node. Renames the underlying document (completed and checked), then the drive's node entry. The handle's document is the drive.

```typescript
renameNode(
  driveIdentifier: string,
  nodeId: string,
  name: string,
  signal?: AbortSignal,
): Promise<NodeWriteHandle>
```

### `write.drives.setPreferredEditorOnNode`

Update the preferred editor recorded in the node's document header meta. Pass `null` to clear it. The handle's document is the node's document.

```typescript
setPreferredEditorOnNode(
  nodeId: string,
  preferredEditor: string | null,
  signal?: AbortSignal,
): Promise<WriteHandle>
```

### `write.drives.moveNode`

Move a node to a different parent folder within the same drive. Pass `undefined` as `targetParentFolderId` to move the node to the drive root. The handle's document is the drive.

```typescript
moveNode(
  driveIdentifier: string,
  srcNodeId: string,
  targetParentFolderId: string | undefined,
  signal?: AbortSignal,
): Promise<WriteHandle>
```

### `write.drives.copyNode`

Copy a node, and its subtree if it is a folder, within a drive. Each file is duplicated (completed), then the drive's nodes are copied. The handle's document is the drive. A copied file keeps its source's `protocolVersions` unless `options.protocolVersions` overrides them; a reactor-drive refuses the override.

```typescript
copyNode(
  driveIdentifier: string,
  srcNodeId: string,
  targetParentFolderId: string | undefined,
  signal?: AbortSignal,
  options?: { protocolVersions?: ProtocolVersions },
): Promise<WriteHandle>
```

### `read.drives.getNode`

Return a single node from the drive's `state.global.nodes` array.

```typescript
getNode(
  driveIdentifier: string,
  nodeId: string,
  signal?: AbortSignal,
): Promise<Node>
```

### `read.drives.listNodes`

Return nodes in the drive, optionally filtered by parent folder. Returns a paged result so you can stream through drives with large node counts.

```typescript
listNodes(
  driveIdentifier: string,
  parentFolder?: string | null,
  paging?: PagingOptions,
  signal?: AbortSignal,
): Promise<PagedResults<Node>>
```

The `parentFolder` argument controls scope:

| Value       | Result                                       |
| ----------- | -------------------------------------------- |
| `undefined` | Every node in the drive                      |
| `null`      | Only root-level nodes                        |
| a folder id | Only the direct children of that folder      |

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

| Value          | Description                |
| -------------- | -------------------------- |
| `Created`      | A new document was created |
| `Deleted`      | A document was deleted     |
| `Updated`      | A document's state changed |
| `ChildAdded`   | A child relationship was added   |
| `ChildRemoved` | A child relationship was removed |

`subscribe` emits the five values above. `ParentAdded` and `ParentRemoved` exist in the `DocumentChangeType` enum but are not currently emitted by `subscribe`.

Which fields populate depends on the change type:

- `Created` and `Updated` carry the changed documents in `documents`.
- `Deleted` carries `documents: []` and the document id in `context.childId`.
- `ChildAdded` and `ChildRemoved` carry `documents: []` and the ids in `context.parentId` and `context.childId`.

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
const handle = await reactorClient.write.execute(docId, "main", actions);

const completed = await reactorClient.read.waitForJob(handle.jobId);
console.log(completed.status); // "READ_READY" or "FAILED"
```
