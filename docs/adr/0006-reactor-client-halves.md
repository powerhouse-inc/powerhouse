# ADR 0006 — Read and write halves of the reactor client

- **Status:** Accepted
- **Date:** 2026-10-25
- **Deciders:** Wouter Kampmann
- **Implements:** commits c2a77eb3b1 through fa1bffa505 on main (reactor halves, write
  handles, RPC namespaces, write identity table, permission tables in the reactor store),
  137114058f through bd3b4361a8 (router halves), f4f7dcc4c0 through 742c1500de (consumers).
  Design notes: `pglite-worker-plan/read-write-client-split-plan.md`,
  `graphql-query-mutation-split.md`, `read-store-projections.md` in the workspace.

## Context

The reactor's stated model is that writes may be slow but must not affect reads, and that an
application reads only read models unless the user is changing something. The code did not hold
to it.

### Key facts about the stack before this decision

- One `IReactorClient` served every caller: the switchboard's GraphQL resolvers, package
  subgraphs, processors, the drive client, MCP, workflows, Connect. Nothing in the types
  separated a read from a write.
- The document view (`DocumentSnapshot`, `SlugMapping`) is a read model stored in the reactor
  store and committed in the purge fence transaction, on the same single PGlite lane as the
  operation log. A document read was two queries on that lane (snapshot, then `MAX(index)`
  per scope on `Operation`), queued behind every executor transaction, view indexing chunk,
  sync load and `VACUUM`.
- Every mutation read the view: target resolution (`resolveWriteTarget` on `SlugMapping` and
  `DocumentSnapshot`), the drive client's node checks (the whole drive document), the model
  subgraph's type check, cascade discovery, and a read-back of the document after
  `waitForJob`, twice (client and resolver).
- Every authorized GraphQL field resolved its identifier through the view and then checked
  permission tables that lived on the read-model store. Writes depended on the read store for
  authorization; reads depended on the write store for identity.
- `executeAsync` returned a pending `JobInfo` with an empty consistency token, so a caller who
  wanted to know when a write had landed had to poll.
- Measured on Sektar's store (18 GB, 13,198 transactions) under 9 writes/s: p95 of document
  reads on the write lane went from 46 ms to 115-206 ms and a typed listing from 91 ms to
  426-537 ms, while index-backed reads on the read store stayed at 36-53 ms.

### Why now

Four implementers of `IReactorClient` existed (in-process, router, RPC proxy, GraphQL browser
client) and roughly 150 call sites. Each new consumer written against the single client would
have to be migrated later, and each new resolver written against it was one more place where a
query could write.

## Decision

### 1. Two client halves, one facade

`IReactorReadClient` answers from read models and never enqueues: `get`, `getMany`, `find`,
`resolveIdOrSlug`, relationships, `getOperations`, `isServed`, `getJobStatus`, `waitForJob`,
`subscribe`, `drives` (read). Reads that can wait for a consistency token take it as their last
parameter.

`IReactorWriteClient` enqueues: `create`, `createEmpty`, `upgradeDocument`, `execute`,
`executeBatch`, `rename`, `setPreferredEditor`, relationship writes, `deleteDocument(s)`,
`loadBatch`, `isDocumentIdTaken`, `evaluateActions`, `describe`, `drives` (write). Every write
resolves when the job is accepted and returns a `WriteHandle`.

`IReactorClient` stays as the facade: `read` and `write` composed, every old method and return
type kept. Its document-returning writes are the write half followed by `handle.document()`
and log a one-time deprecation warning per method (`PH_SILENCE_DEPRECATIONS` silences it).
The `*Async` methods are not deprecated. The facade stays for several releases.

### 2. Write handles

```ts
interface WriteHandle {
  jobId: string; documentId: string; branch: string;
  written: Promise<WriteReceipt>;   // operations are in the log (WRITE_READY)
  readable: Promise<WriteReceipt>;  // every pre-ready read model holds them (READ_READY)
  document<T>(view?, signal?): Promise<T>; // readable, then a token-bounded gated read
}
type WriteReceipt = { job: JobInfo; token: ConsistencyToken; documentId: string; branch: string };
```

`written` and `readable` are lazy, so a caller that does not await a stage never owns a
rejection. Both reject with `JobFailedError` only when the job itself failed; a reducer error
stays on `receipt.job.result`, as before. `JobAwaiter.waitForStage` backs the stages. Over RPC a
handle crosses the wire as ids and is rebuilt on the client from `getJobStatus` and `waitForJob`.

### 3. Clients on the GraphQL context, by operation type

`GraphQLManager` takes `readClient` and `writeClient`. Each request's context carries
`clients.read`; `clients.write` is present only when the executing operation is a mutation.
Query resolvers use the read half; mutation resolvers use the write half, get a handle, and
read back once with `readAsCaller(read, receipt, subject, branch)`, which is `read.get` with
the receipt's token. Five queries that serve write-side state by design (`pollSyncEnvelopes`,
`syncHolds`, `peerAgreement`, `evaluateActions`, and the sync poll refusal recording) are
bound explicitly in `WRITE_SIDE_QUERIES`. A schema-walking test asserts the binding. The
`document`, `findDocuments` and relationship queries accept an optional `consistency` token
argument, so a remote client can bound a read after its own write.

Package subgraphs get `readClient`; `reactorClient` remains as the deprecated facade.
Processors get `module.read` and write through `dispatch`, which gained `createInDrive` and
`deleteDocument`.

### 4. A write-side identity table

`WriteIdentity` (documentId, branch, slug, documentType, isDeleted) lives in the reactor store
and is written inside the executor's transaction for every `document`-scope create, upgrade
and delete, from the same slug derivation the view uses (`shared/document-identity.ts`).
`resolveWriteTarget`, `resolveReference` and `write.describe` read it; the view is consulted
only when a row is missing (documents created before migration 028's backfill), and that
fallback is counted. The drive write client stops reading the drive document where the
reducer already rejects the case; `copyNode` and folder removal still read through the read
half and say so.

### 5. Permission tables in the reactor store

`DocumentPermission`, `OperationUserPermission` and `DocumentProtection` are created by
reactor migration 029 and read through `DocumentPermissionService` bound to the reactor
store, behind a per-process `PermissionCache` (invalidated by the service's own writes, TTL
30 s by default, 10,000 entries). The switchboard copies existing rows from the read-model
store once at boot and renames the old tables. Purge deletes a document's permission rows.

### 6. Read-after-write stays job-based

`READ_READY` is set after the pre-ready read models commit, so "execute, then read" keeps its
guarantee on one store without tokens. When the document view is duplicated into the read
store (a later decision), that copy must be registered pre-ready; registered post-ready it
would silently break every in-process reader.

## Consequences

### Positive

- The framework's own surfaces (GraphQL, subgraphs, processors, drive client, router, RPC,
  Connect) now use the half they may use, and the context gating turns "a query that writes"
  into a runtime error that names the field.
- Mutations resolve targets and describe documents without the document view; the proof test
  renames the view's tables and shows `execute` still committing while `get` fails.
- Every write exposes when it was accepted, written and readable, in-process and over RPC and
  GraphQL, with the same four lines of caller code.
- Authorization no longer crosses stores: identity on the write side for mutations, permissions
  on the write side for everyone, with one cache instead of a store hop per request.
- No wire change for existing clients. The facade keeps every in-process caller compiling, and
  the existing client tests pass unchanged against it.

### Negative / risks

- The facade's writes now wait for `readable` and then read back through the read half, which
  is a no-op wait on one store today but one more round trip in code. Deprecation warnings
  will appear in logs of unconverted callers until they move.
- `updateRelationship`, `moveRelationship`, `isDocumentIdTaken` and `evaluateActions` still
  read the view on the write side; the proof test does not cover them.
- The permission cache has a TTL window across switchboard instances until cross-node
  invalidation exists.
- Reactor-api, reactor and the switchboard must ship together for the permission move; a
  mismatched pair keeps the tables on the read store.
- The deprecated facade is a second surface to maintain for several releases.

Confidence: high for the split and the handles (covered by the existing suites plus new
tests); medium for the boot-time permission backfill, which was tested in isolation but not
yet on a production store. Revisit if a third client implementation needs document-returning
writes, or when the document view moves to the read store (then the read half rebinds and the
`consistency` argument becomes the only read-after-write path for remote clients).

## Alternatives considered

- **Do nothing.** Keeps the single client and the implicit read-after-write. Rejected: every
  new consumer and resolver adds to the migration later, and the measured read degradation
  under write load is structural, not a tuning problem.
- **Additive split only (narrow interfaces, no write handles).** Keeps writes returning
  documents. Rejected: new callers keep writing "execute, use the document", and the
  read-after-write contract stays implicit, which is what breaks when reads move to another
  store or node.
- **Breaking split, no facade.** Rejected by the deciders: external projects need time to
  adapt, and the facade costs little.
- **Permission tables left on the read-model store.** Rejected: every authorized write would
  keep depending on the read store, which the split exists to remove.
- **Enforce the query/mutation rule by lint only.** Rejected: third-party subgraphs are not
  linted by this repo; the context gating catches them at runtime with a clear error.
