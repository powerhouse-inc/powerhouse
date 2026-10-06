# ADR 0005 — Reactor access for workflow pieces

- **Status:** Proposed
- **Date:** 2026-10-01
- **Deciders:** acaldas
- **Implements:** TBD; revises #3041 (reactor access gate) and resolves #3040
  (run principal) for reactor calls. Depends on registry-loaded models being
  importable by workers (`fix/registry-models-for-workers`).

## Context

Only `@powerhousedao/piece-reactor` can reach the reactor. The executor serves
`ctx.reactor` by package name (`servesReactorPort`,
`reactor-workflow/src/pieces/engine/blocks.ts`). Third-party pieces cannot read
or write documents.

Runs have no principal:

- Run-time reactor calls use the host's `IReactorClient` with no subject, so
  reads use the Switchboard's own subject.
- The Switchboard's signer signs every write.
- Only design-time option resolvers are scoped to a caller
  (`ScopedDesignTimeReactorPort`).

The reactor already supports acting for a user:

- Reads take a per-call subject (`ViewFilter.subject`).
- `evaluateActions` decides a write for a given subject without applying it.
  It throws when `REACTOR_AUTH_ENFORCEMENT` is off.
- Admission decides a write by the action's signer. A key may sign as a user
  only through that user's Renown credential, which carries no scopes.

The GraphQL API checks a caller twice: `IAuthorizationService` by address
(`BaseSubgraph.assertCanRead`/`assertCanWrite`), then the reactor gate with the
caller's subject.

Two mechanisms already cross worker boundaries:

- `reactor-browser/src/rpc` serves an `IReactorClient` to a worker.
  `ReactorHostServer(client, transport)` calls any method of the client it is
  given. `createReactorClientProxy(router, { registry })` forwards calls,
  pages through `next()`, forwards abort signals, and answers document-model
  lookups from a local registry.
- The reactor builder resolves document-model sources into a manifest of
  importable entries (`getResolvedModelManifest()`). Executor and projection
  workers import their models from it, and the resolver sends entries it loads
  at run time as `load-model`.

## Decision

Any piece may request reactor access. The user grants it with a reactor
connection, and the run acts as the user who last published the workflow. The
host makes every reactor call; the reactor decides each one for the run user.
Phase 1 covers the local reactor only.

### 1. Pieces declare access per action and trigger

```ts
export const archiveInvoice = createAction({
  name: "archive_invoice",
  displayName: "Archive invoice",
  requireReactor: "write", // or "read"
  props: {
    invoiceId: Property.ShortText({ displayName: "Invoice", required: true }),
  },
  async run(ctx) {
    const doc = await ctx.reactor.get(ctx.propsValue.invoiceId);
    const invoice = await ctx.reactor.getDocumentModelModuleForDocument(doc);
    return ctx.reactor.execute(doc.header.id, "main", [
      invoice.actions.setStatus({ status: "ARCHIVED" }),
    ]);
  },
});
```

- `@powerhousedao/pieces-framework` exports its own `createAction` and
  `createTrigger`. They wrap upstream's, derive their parameters from it, and
  add `requireReactor`, named after upstream's `requireAuth` (whether the step
  needs a connection). `upstream/` stays unchanged.
- `ctx.reactor` is typed from the declaration: `"read"` gets a
  `ReactorReadClient`, `"write"` a `ReactorClient`, and `false` or no
  declaration gets no `ctx.reactor`.
- `reactorOf` is removed.
- `buildDescriptor` and `ph build` copy `requireReactor` into each
  descriptor; `false` is left out.
- `ph generate piece-action` and `ph generate piece-trigger` always write
  the field: `false`, or the value of `--require-reactor read|write`.

### 2. `ctx.reactor` is a subset of `IReactorClient`

Methods are picked from `IReactorClient`, with the client's own signatures and
types. Writes are `create`, `createEmpty`, `execute` and `deleteDocument`;
pieces build actions with document-model action creators and pass them to
`execute`, as reactor-browser code does:

```ts
type ReadMethods =
  | "get"
  | "resolveIdOrSlug"
  | "find"
  | "getOperations"
  | "getOutgoingRelationships"
  | "getIncomingRelationships"
  | "getOutgoingRelationshipEdges"
  | "getIncomingRelationshipEdges"
  | "getDocumentModelModules"
  | "getDocumentModelModule"
  | "getDocumentModelModuleForDocument";
type WriteMethods = "create" | "createEmpty" | "execute" | "deleteDocument";
type RefusedMethods =
  | "createDocumentInDrive"
  | "executeBatch"
  | "rename"
  | "setPreferredEditor"
  | "addRelationship"
  | "updateRelationship"
  | "removeRelationship"
  | "moveRelationship"
  | "upgradeDocument"
  | "deleteDocuments"
  | "executeAsync"
  | "createAsync"
  | "createEmptyAsync"
  | "getJobStatus"
  | "waitForJob"
  | "subscribe"
  | "loadBatch"
  | "evaluateActions"
  | "isDocumentIdTaken"
  | "isServed"
  | "getCreateSignaturePolicy"
  | "getCreateProtocolVersions"
  | "drives";

// Fails to compile, naming the method, when a client gains one no list names.
type Listed<T extends never> = T;
type _Client = Listed<
  Exclude<keyof IReactorClient, ReadMethods | WriteMethods | RefusedMethods>
>;

export type ReactorReadClient = Pick<IReactorClient, ReadMethods>;
export type ReactorClient = Pick<IReactorClient, ReadMethods | WriteMethods>;
```

A drive file is a `create` under the drive, which adds the drive's `child`
relationship, then an `execute` of the drive's `ADD_FILE`:

```ts
const file = await ctx.reactor.create(document, driveId);
await ctx.reactor.execute(driveId, "main", [
  addFile({ id: file.header.id, name, documentType, parentFolder }),
]);
```

Run-time rules:

- **Identity.** The host sets the run user as the subject. A call that passes
  `view.subject` or `subject` is refused.
- **Abort.** A piece's `signal` is combined with the step deadline.
- **Signing.** The host signs every action and refuses one that carries
  `context.signer`. New documents get the host's create signature policy.
- **Model operations only.** `execute` refuses the document lifecycle actions
  (`DOCUMENT_SCOPE_ACTION_TYPES`: create, delete, upgrade, purge and the
  relationship actions). Pieces create with `create` or `createEmpty`, and
  delete with `deleteDocument`.
- **No cascade.** `deleteDocument` refuses `PropagationMode.Cascade`.
- **Paging.** `next()` works within the step; `nextCursor` resumes in a later
  step. The host caps `paging.limit`.
- **Writes block, as on the client.** A write returns when its jobs are
  `READ_READY`, within the step deadline. It throws on a reducer error or a
  denial, and throws `ReactorJobPendingError` when a job is still running at
  the deadline. Errors cross by `name` and `message`; `pieces-framework`
  exports the names.

Not offered:

| Methods                                                                                                                                                                                         | Why                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `createDocumentInDrive`, `executeBatch`, `rename`, `setPreferredEditor`, `addRelationship`, `updateRelationship`, `removeRelationship`, `moveRelationship`, `upgradeDocument`, `deleteDocuments` | The host would have to rebuild each to check it as the run user. Pieces build the actions and call `execute`.          |
| `drives`                                                                                                                                                                                        | Its reads take no subject; its writes are conveniences over `create` and `execute`.                                    |
| `executeAsync`, `createAsync`, `createEmptyAsync`, `getJobStatus`, `waitForJob`                                                                                                                 | A job must finish within its step, with its outcome checked.                                                           |
| `subscribe`                                                                                                                                                                                     | Triggers cover document events.                                                                                        |
| `loadBatch`                                                                                                                                                                                     | It loads operations other principals already signed, so the host can neither sign them nor check them as the run user. |
| `evaluateActions`, `isDocumentIdTaken`, `isServed`, `getCreateSignaturePolicy`, `getCreateProtocolVersions`                                                                                     | Host internals. `isDocumentIdTaken` answers for documents the user cannot read.                                        |

A refused method throws `ReactorAccessDeniedError` naming it.

`pieces-framework` takes type-only peer dependencies on
`@powerhousedao/reactor` and `@powerhousedao/shared`, and holds these types
itself:

- `Pick` only accepts names the client has, so a removed or renamed method
  fails to compile.
- Signatures come from the client, so a changed signature reaches pieces and
  `RunScopedReactorClient` as a type error.
- `Listed` fails when the client gains a method that no list names.

### 3. Transport: the reactor RPC, wrapped

The RPC code moves unchanged from `reactor-browser/src/rpc` to
`@powerhousedao/reactor/rpc`; `reactor-browser` imports it from there.

A run's piece steps share one child process (`PieceWorkerSession`), which
runs them one at a time. The host runs one unmodified `ReactorHostServer` per
step request (action, trigger hook or option resolver):

```ts
const server = new ReactorHostServer(
  servedClient(
    new RunScopedReactorClient(reactorClient, {
      runUser,
      requireReactor,
      connection,
      deadline,
      journal,
    }),
  ),
  createIpcTransport(child, requestId),
);
server.start(); // stop() when the step answers drops page tokens and aborts requests
```

- `RunScopedReactorClient` implements the piece surface and applies §2 and
  §7. `servedClient` gives the server only the offered methods, and a
  refusal for each refused one.
- It wraps each page's `next`, so later pages are journaled too.
- `execute` and `create` keep #3148's approach, run on the host:
  `executeAsync` or `createAsync`, the job id recorded in the run journal at
  submit, then `waitForJob` until the deadline less a margin, an outcome
  check per action and a read-back. No request has a fixed cap; each lasts
  until the step deadline.
- `deleteDocument` passes `evaluateActions` on the document's
  `DELETE_DOCUMENT`, then calls the client's own `deleteDocument`. The
  parent-relationship removals the client adds are admitted by the
  Switchboard's grant on each parent, not checked for the run user.
- `createIpcTransport` implements `IRpcTransport` over the child's IPC
  channel, shared with job messages and `ctx.store` calls.

Every call is bound to the request that made it:

- The host gives each request an id and sends it with the request.
  `createIpcTransport` tags outgoing messages with it and drops incoming ones
  that carry any other id.
- In the worker, each request gets its own `createReactorClientProxy`, typed
  from the declaration and on a transport tagged with the request's id. The
  proxy closes when the request settles.
- A `ctx.reactor`, or a page's `next`, kept past its request throws
  `ReactorRequestClosedError`. It never reaches a later request's server, so
  a child that serves several runs cannot act as another run's user.

The `reactor.*` host calls and `RemoteReactorService` are removed; `ctx.store`
keeps its host calls.

### 4. Document models in the worker

The worker holds live modules, so pieces call reducers, `utils` and action
creators directly.

- **Switchboard:** it resolves worker model sources when the executor worker
  pool, projection workers or workflows are on.
- **Host:** `WorkflowRuntimeHostDeps` gains `modelManifest()`, backed by
  `getResolvedModelManifest()`, and `modelEntries(documentType)`, backed by
  the builder's `getImportableEntries(documentType)`. The latter covers boot
  entries and those the resolver loads at run time. The host sends the boot
  manifest when it forks a run's child. It pushes nothing after that.
- **Worker:** it imports an entry the first time a piece asks for its type,
  with the reactor's spec loader, and registers it in the proxy's registry.
  For a type missing from its manifest, such as one the host loaded after the
  fork, it asks the host once per miss for that type's entries and caches
  them. `getDocumentModelModules` first asks for every entry the host knows,
  then loads them all.
- A type without an entry throws `DocumentModelUnavailableError`. Documents of
  that type stay readable and writable.
- The worker's modules decide nothing; the reactor applies every action on the
  host.

### 5. Reactor connections

A reactor connection is a `powerhouse/connection` document:

- `authType: REACTOR`, with a reserved connector id that any piece may bind.
- Config:
  - `endpoint: "local"`, the only value in phase 1;
  - optional `access: "read"`.
- No secrets. "Check connection" on one checks its config only.

Steps and triggers gain `reactorConnectionId`, bound per run like
`connectionId`. The editor shows it when the selected action declares
`requireReactor`.

### 6. The run user

- The run user is the signer of the latest publish operation. Runs execute the
  published snapshot, so the publisher vouches for what runs.
- On publish, on enable, at startup and before each run, the host checks that
  the reactor serves every reactor connection the snapshot binds to the run
  user (`isServed` with the run user as subject).
- A workflow with no run user (an unsigned publish) may read and write with
  `REACTOR_AUTH_ENFORCEMENT` off, and gets no reactor access with it on.
- With enforcement on, the editor requires sign-in, so publishes are signed.

### 7. Host-side checks, per call

The host refuses a call unless all of these pass, in order:

1. **Declaration:** a `requireReactor: "read"` action cannot call a write
   method.
2. **Connection:** a connection with `access: "read"` refuses writes.
3. **Reactor gate,** as the run user:
   - reads pass the run user's subject;
   - `execute` passes `evaluateActions` on the actions it is given, then the
     Switchboard signs them;
   - `deleteDocument` passes `evaluateActions` on the document's
     `DELETE_DOCUMENT`;
   - `create` and `createEmpty` need checks 1 and 2 only; admission decides
     them by the Switchboard's signature.

The run records the document ids of every read and, at submit time, of every
write, so run visibility and erasure cover writes whose read-back failed. A
document the run creates gets an auth grant for the run user.

With enforcement off, the host skips `evaluateActions`; checks 1 and 2 still
apply.

### 8. The Switchboard needs grants under enforcement

Admission decides a write by its signer, the Switchboard. Under enforcement, a
write lands only if the run user and the Switchboard may both make it. The auth
model does not change.

- The workflow-runtime subgraph tells the editor what it needs to grant the
  Switchboard, and nothing more:

  ```graphql
  workflowRuntime {
    authEnforcement # any caller
    reactorIdentity { address key } # authenticated callers
    authConditions # authenticated callers
  }
  ```

  `authEnforcement` decides whether the editor asks for sign-in and grants at
  all, so logged-out users can build workflows on an open Switchboard.
  `evaluateActions` already reveals it. The Switchboard's address and key
  appear on every operation it signs.

- The editor grants the Switchboard global-scope `execute`, plus document-scope
  `DELETE_DOCUMENT`, `ADD_RELATIONSHIP` and `REMOVE_RELATIONSHIP` for creates in
  a drive and deletes, with `setGrant` on each document the user picks: `{ match: subject.key == <key> }` when
  `authConditions` is on, otherwise `{ address: <address> }`.
- Grants are per document; a drive's grants do not cover its documents.

### 9. Editor support

- A sign-in prompt when enforcement is on.
- Reactor-connection setup: the access setting, what each bound step
  declares, and the Switchboard grant on documents the user picks.
- The run user ("runs as") on each step bound to a reactor connection.
- Run errors as the host reports them.

### 10. The name gate goes

`servesReactorPort` is removed. `piece-reactor` declares `requireReactor`
like any other piece. Design-time option resolvers get a `ReactorReadClient` bound to
the GraphQL caller.

### 11. Step forms carry the simplifications

The host stops shaping results for `piece-reactor`. Its actions and props take
over:

| Convenience                                | Moves to                                                                                              |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Find across all types                      | `document-find`, per type from `getDocumentModelModules`                                              |
| Name and state-field matches, result cap   | `document-find`, over the pages it reads                                                              |
| Display name from `state.global.name`      | the document props' option labels                                                                     |
| Folder id resolved to its drive            | `folderProp` gives drive and folder, from the drive's `state.global.nodes`                            |
| Drive parent or document parent            | the step calls `create` under the parent, then `execute`s `ADD_FILE` for a drive                      |
| Action lists, input schemas, `SET_NAME`    | `actionTypeProp`, from the module in the worker                                                       |
| Building actions, default scope and branch | the module's action creators and form defaults                                                        |
| Document summaries as step outputs         | writes: a `DocumentReference`; reads: `{ header, state }`, and `{ results, nextCursor }` for listings |

Outputs leave out `operations` and `clipboard`, since the run journal stores
them.

The run journal stores no document state:

- Writes output a reference, `{ documentId, documentType, branch, revision }`,
  and the journal stores it as it is.
- Reads keep state in the run, but the journal stores a reference. It replaces
  every value shaped like a reactor document, in any piece's output, with
  `{ "$documentRef": DocumentReference }`, before redaction and the size cap.
- Reruns re-read. A rerun runs a step declaring `requireReactor: "read"`
  again when its journaled output holds a `$documentRef`, since reading a
  document at a past revision is not supported yet (#3179).
- A rerun never repeats a write. Any other step reuses its journaled output,
  references included.

## Consequences

### Positive

- Any piece can work with documents, within its declaration and the user's
  connection.
- No user key is created or stored.
- The reactor decides every read and write for the run user, as it does for a
  GraphQL caller.
- The piece contract is `IReactorClient`'s, so reactor docs and types apply,
  and piece code reads like reactor-browser code.
- The host wrapper checks only what it forwards: reads, `execute`, `create`
  and `deleteDocument`. It rebuilds no convenience write.
- Connect and piece workers share one RPC implementation.

### Negative / risks

- Pieces build actions themselves. A drive file takes two calls, and an
  `ADD_FILE` for a document created outside the drive leaves a node with no
  `child` relationship.
- Pieces cannot upgrade documents, change relationships directly, or delete
  with a cascade.
- Runs skip `IAuthorizationService`, which the GraphQL API checks before the
  reactor gate. With enforcement off, only the declaration and the
  connection's `access` separate pieces from documents.
- Documents record the Switchboard as signer of every write; only run records
  name the run user.
- Under enforcement, every target document needs a grant for the Switchboard as
  well as the run user, and grants are per document.
- The editor's document-scope grant lets the Switchboard delete and relate
  documents; the run user's `evaluateActions` check still decides the delete.
- Without `authConditions`, a grant to the Switchboard's address also grants
  the operator whose `ph login` identity it uses.
- The Switchboard creates every document a run creates, so it keeps auth-scope
  rights on them.
- A compromised Switchboard bypasses every host check, as it can today.
- `pieces-framework` (MIT) gains type-only dependencies on Powerhouse packages,
  against #3041's plan to remove Powerhouse code from it.
- Each run's child imports the models its pieces use, so every run pays that
  import.

### Confidence and revisit

High confidence for the local reactor. Revisit for remote reactors (phase 2),
for subscriptions or async writes, for operation-level declarations, and for a
separate declaration for deletes.

## Alternatives considered

- **The full `IReactorClient` write surface,** with `rename`, relationships,
  upgrades, batches, cascade deletes and drive writes: rejected. Each
  convenience write had to be rebuilt on the host from action creators to
  check it as the run user; forwarding one to the inner client would skip the
  checks.
- **Lifecycle actions through `execute`:** rejected; one path each for
  creates and deletes keeps the checks in one place.
- **`drives.getNode` and `drives.listNodes`:** rejected; they take no subject,
  so serving them as the run user meant reimplementing them.
- **`IAuthorizationService` checks per call:** rejected; the reactor gate
  decides for the run user, and duplicating it on the host needed its own
  wrapper per method.
- **A connection filter** (document, drive, type and operation lists):
  deferred; it needed a host-side matcher on every call and listing.
- **A "Check access" preflight** listing what a connection reaches: deferred
  with the filter it reported on.
- **A narrow, document-shaped contract** over summaries: a second API to
  document, with `piece-reactor`'s conveniences built into the host.
- **One host call per method:** reimplements correlation, paging and abort
  that the reactor RPC has.
- **Policy inside `ReactorHostServer`:** the server is shared with Connect; a
  client wrapper carries the policy without changing it.

## Known limitations

- **Remote reactors (phase 2).** A remote Switchboard cannot learn the run user
  without a key that signs as that user. Phase 2 adds a user-signed statement
  allowing a Switchboard to act for the user, and the remote enforces both
  their grants.
- **Creates.** `evaluateActions` allows every `CREATE_DOCUMENT`, and a create
  under a parent adds the parent's relationship by the Switchboard's grant, so
  a create is limited only by the declaration and the connection.
- **Ids inside actions.** `execute` evaluates the document it names; ids in an
  action's input, such as an `ADD_FILE`'s document, are not checked.
- **Operation-level declarations.** A piece cannot request specific
  operations.
- **Dev mode.** The host loads project models from source through Vite, while
  the manifest points at `dist/`. Until the package is rebuilt, pieces get
  older models, or none. Documents stay correct because the host applies every
  action.
