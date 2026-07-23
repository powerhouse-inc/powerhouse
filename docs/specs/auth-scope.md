# Spec — Attribute-based access control in the auth scope with DCB

## Motivation

Currently, all authorization lies outside of the Reactor (eg - middleware, gql layer, etc) or inside of reducers. This means we often need to implement the same auth logic in multiple places and it imposes restrictions on the types of auth even possible.

This spec pulls authorization into the core Reactor. This allows us to ride on top of all the great guarantees we already provide (event log, synchronization, signatures, etc). It also allows for consistency guarantees that simply cannot be provided for externally.

## Overview

From a high level: we propose expanding the current `auth` scope to hold a stacked list of **grants**. Grants apply either baked in policies or dynamically evaluated conditions to various **principals**. These principals are either specific users or refer to groups described by a new `PHGroup` document model (`powerhouse/document-group`).

We will do this by generalizing consistency requirements between what are now independent event streams, dictated by `(docId, branch, scope)` tuples. That is, we need to be able to describe consistency guarantees between the `("A", "main", "global")` stream and the `("A", "main", "auth")` or even `("A-group", "main", "global")` streams.

We already do this, in specific, with `document` and "domain" (i.e. `global`, `my-custom-scope`, etc) scopes -- but we need to generalize this idea.

We can do this by introducing the well-tested pattern of [**Dynamic Consistency Boundaries**](https://dcb.events/) (DCB).

In DCB terms, we define a number of **projections** over a specific set of streams. Each projection looks like:

```
f(state, event) => state
```

In our case, the function `f` is the scope's reducer, and we end up with the document's scoped state. This all already exists.

However, DCB introduces a new idea called a [**Decision Model**](https://dcb.events/topics/projections/#composing-projections). A decision model is a composition of projections. When evaluated, it yields an **append condition**. The append condition is essentially the set of all positions in the various streams which the operation store enforces at write time.

That is, the append condition compiles to a SQL statement that is appended to the SQL insert. It will reject if the read-set is invalid. This is described in more detail in below sections.

While DCB allows for arbitrary decision models, for now Auth is the first and only decision model. The machinery is written so that nothing in it is auth-specific, though registering further decision models is out of scope here.

## Auth Scope Data Model

`PHBaseState` already carries an empty `PHAuthState` placeholder. We will fill it out with this model:

```typescript
type PHAuthState = {
  version: number;
  grants: Grant[];
  creator?: string;         // did:key of the genesis signer; set once by INITIALIZE_AUTH
};

type Grant = {
  id: string;               // stable; SET_GRANT upserts, REMOVE_GRANT deletes
  description: string;      // intent, shows in the audit trail
  effect: "allow" | "deny";
  principal: Principal;     // who
  capability: Capability;   // what they may do
  where?: Condition;        // optional; the grant applies only when this holds
};

type Principal =
  | { anyone: true }        // any signer, including anonymous
  | { address: string }     // one wallet
  | { group: string }       // a PHGroup document id
  | { match: Condition };   // relationship, e.g. subject.address == doc.global.rtoAddress

type Capability = {
  can: "read";
  scope?: string;
} | {
  can: "execute";
  scope?: string;
  operation?: string[];
};
```

Auth scope actions are applied by a dedicated `AuthActionHandler` and are never passed to model reducers. This is the same approach as we've taken with the `document` scope reducer. The resulting state is event-sourced, signed, and replicates with the document, so the policy travels with the document instead of living outside of it.

### Actions

The auth scope has four actions. All are applied by the `AuthActionHandler`.

```typescript
type InitializeAuthInput = {
  grants: Grant[];
};

type SetGrantInput = {
  grant: Grant;
};

type RemoveGrantInput = {
  id: string;
};

type MoveGrantInput = {
  id: string;
  index: number;
};
```

`INITIALIZE_AUTH` is the genesis operation. It is valid only at auth revision zero and carries the document's initial grants. On a signed document its signer must match the header key, and that signer is stored as `creator` (see Administration and bootstrap).

`SET_GRANT` upserts by `grant.id`. An existing id is replaced in place and keeps its position. A new id appends to the end of the list.

`REMOVE_GRANT` deletes by id. An unknown id is an error.

`MOVE_GRANT` moves an existing grant to `index`. Order is significant because the last applicable grant wins.

`UNDO`, `REDO`, and `PRUNE` are rejected on the auth scope.

On a `PHGroup` document, `INITIALIZE_AUTH` and `SET_GRANT` reject any grant whose principal is `{ group }`. That is, **a group's auth scope cannot reference other groups**. The `AuthActionHandler` checks the document's own type, so the check is deterministic on every replica. We need this restriction to prevent reference cycles and to keep the systems that follow group references simple rather than potentially recursive (see Groups and Synchronization).

### Grants

The list of `Grant` objects defines a policy. Each grant is applied on top of the previous one. This allows for situations where you might want to deny all access by default and only allow specific capabilities (or vice-versa).

`Principal` objects define who is allowed to perform a `Capability`.

`Capability` objects define the explicit grant. Wildcards can be used for `scope`, or it may be omitted.

```typescript
{
  version: 0,
  grants: [
    // nobody executes anything, anywhere
    { id: "g-lockdown", description: "default lockdown", effect: "deny",
      principal: { anyone: true },
      capability: { can: "execute", scope: "*" } },

    // …except legal assistants, in the global scope, while the statement isn't terminal
    { id: "g-las", description: "LAS review before terminal", effect: "allow",
      principal: { group: "phd…las" },
      capability: { can: "execute", scope: "global" },
      where: { notIn: [ { attr: "doc.global.status" },
                        [ { lit: "APPROVED" }, { lit: "REJECTED" } ] ] } },
  ],
}
```

### Condition language

Conditions must be deterministic, total (meaning that they must _never throw_, given any state shape), pure, JSON-serializable, and versioned by `PHAuthState.version`. An evaluator object consumes these conditions and is a small pure function in `shared/document-model`.

```typescript
export type Condition =
  | { eq: [Operand, Operand] }
  | { ne: [Operand, Operand] }
  | { in: [Operand, Operand[]] }
  | { notIn: [Operand, Operand[]] }
  | { lt: [Operand, Operand] }        // numbers and strings; mixed types -> false
  | { lte: [Operand, Operand] }
  | { gt: [Operand, Operand] }
  | { gte: [Operand, Operand] }
  | { exists: Operand }
  | { and: Condition[] }
  | { or: Condition[] }
  | { not: Condition };

export type Operand =
  | { attr: string }                  // "doc.global.status", "subject.address", "action.input.newStatus"
  | { lit: string | number | boolean | null };
```

A path that does not resolve yields undefined, as does a path resolving to an object or array. Every comparison involving undefined is false. Exists tests presence explicitly. Numbers compare numerically and strings by code point.

`SET_GRANT` caps grant count and condition size and depth at validation, because every replica re-evaluates the policy at every operation's position. It also rejects a path that names a scope other than the capability's own, since conditions read only the executing scope and such a path can never resolve.

## Projections and the Decision Model

We define the following types to support the DCB pattern:

```typescript
type StreamQuery =
  { documentId: string; branch: string; scope: string };

type Projection<M> = {
  reducer: Reducer;
  // important point: we need to allow for composition with other projections
  query: StreamQuery | ((model: M) => StreamQuery[]);
};

// the scope's state at the operation's index
type DecisionContext = { scopeState: unknown };

type DecisionModel<M> = {
  projections: { [K in keyof M]: Projection<M[K], M> };
  decide(model: M, subject: Subject, request: Request, ctx: DecisionContext): "allow" | "deny";
};
```

A derived query may read only projections whose own queries are static. For instance, we may need to generate queries based on group streams. However, we only allow this one layer deep as a simple guard against potential cycles. The auth model fits this limit exactly: a group's auth scope cannot reference another group (see Actions), so group-derived queries never need a second layer.

Building the model does two things at once: it "folds" the projections (i.e. creates the state), and it captures the exact position of each stream.

```typescript
type DecisionTarget = { documentId: string; branch: string };

// we need to fail the append if any of these streams has operations past `revision`
type AppendCondition = {
  streams: Array<{ documentId: string; scope: string; branch: string; revision: number }>;
};

function buildDecisionModel<M>(
  store: IOperationStore,
  definition: (target: DecisionTarget) => DecisionModel<M>,
  target: DecisionTarget,
): { model: M; appendCondition: AppendCondition };
```

The append condition, as described before, is the model's read-set. It has one entry per stream the projections read, and stores the revision it read to. This allows us to guarantee that the state of the document's scope applied by the reducer holds only as long as none of these streams has grown. The store enforces this at write time (see Enforcement), so a decision can never be committed against streams that changed during the reducer execution.

The full auth decision model composes three projections, and we can see easily how we might incrementally add the projections to the decision model to roll out this feature. There are two projections over the target document (i.e. we need `document` and `auth` streams), and a set of projections over the referenced group documents:

```typescript
const AuthDecisionModel = (target: DecisionTarget): DecisionModel<{
  document: PHDocumentState;
  auth: PHAuthState;
  groups: Record<string, PHGroupState>;   // group document id -> state
}> => ({
  projections: {
    document: {
      initialState: defaultDocumentState(),
      apply: applyDocumentOperation,
      query: { documentId: target.documentId, branch, scope: "document" },
    },
    auth: {
      initialState: defaultAuthState(),
      apply: applyAuthOperation,
      query: { documentId: target.documentId, branch, scope: "auth" },
    },
    groups: {
      initialState: {},
      apply: applyGroupOperation,
      query: (model) => referencedGroupIds(model.auth.grants)
        .map((id) => ({ documentId: id, branch: "main", scope: "global" })),
    },
  },
  decide(model, subject, request, ctx) { /* the decision algorithm below */ },
});
```

The `document` projection is intended to replace the current metadata cache used for document versioning and the `isDeleted` check. This is the special-case consistency cache that is already present -- but can be removed when transitioning to DCB.

The `auth` projection rebuilds the grant list from the auth event stream.

The `groups` projection is the most complicated, and should be the last to introduce. Its stream set is derived from the auth scope state (the auth projection's folded state), so adding a grant that names a new group pulls that group's stream into the model.

The `ctx` on the `decide` function includes the executing scope's own state (for conditions reading `doc.global.*`).

The platform registers exactly this one model, although nothing in the evaluation rules below depends on the model being auth. Generalizing is a matter of registration and composition, not a new feature.

## Decision algorithm

Every request runs through this one function.
```typescript
type AuthModel = {
  document: PHDocumentState;
  auth: PHAuthState;
  groups: Record<string, PHGroupState>;
};

// who is acting: the verified signer (executes) or the authenticated caller (reads)
type Subject = {
  address?: string;
  key?: string;
};

// what they are attempting
type Request = {
  verb: "read" | "execute";
  scope: string;
  // action type; execute only, a read has no operation
  operation?: string;
};

function decide(
  model: AuthModel,
  subject: Subject,
  request: Request,
  ctx: DecisionContext,
): "allow" | "deny";
```

```text
1. if model.document.isDeleted:
      return DENY                     # a deleted document refuses everything

2. if the auth scope is uninitialized (no genesis operation):
      return ALLOW                    # legacy: a document with no policy is unaffected

3. if request is an execute in the "auth" scope
      and subject is the creator (model.auth.creator):
      return ALLOW                    # administration can never be locked out of itself

4. decision = DENY                    # default-deny once a policy exists
   for grant in model.auth.grants, in order:
      if covers(grant.capability, request)
         and matches(grant.principal, subject, ctx)
         and (grant.where is absent or eval(grant.where, ctx)):
            decision = grant.effect    # "allow" or "deny"; the last applicable grant wins
   return decision


covers(capability, request):
   capability.can == request.verb
   and (capability.scope is absent or capability.scope == "*" or capability.scope == request.scope)
   and (request.verb == "read"                 # a read has no operation
        or capability.operation is absent      # execute: absent = every operation in the scope
        or request.operation in capability.operation)

matches(principal, subject, ctx):
   { anyone: true }      -> true
   { address }           -> principal.address == subject.address
   { group }             -> membership folded at the operation's position (see Groups)
   { match: Condition }  -> eval(Condition, ctx)
```

Deletion is evaluated at position like everything else, rather than absolutely, like the current Reactor implementation. This means that an operation that sorts before the `DELETE_DOCUMENT` still applies, and everything after it denies, across every replica.

The grants are a stack. A capability that omits `scope` (or sets it to `"*"`) covers every scope. An `execute` capability that omits `operation` covers every operation in its scope.

A grant that uses a feature that doesn't yet exist never applies. For instance, `{ group }` principals, `{ match }` principals, and `where` conditions will not apply in grants until the actual feature evaluator exists. Skipping an allow withholds access, so an unevaluated allow can never widen a policy. Skipping a deny withholds nothing: a policy that relies on a conditional or group-scoped deny is weaker than written until the feature it uses is live.

The creator can always execute `auth` operations, even against a grant list that tries to deny them, so that a document can never be bricked by locking out its own creator. However, this is deliberately narrow, covering only  `auth`-scope execution. The creator gets no special access to domain operations or reads.

This creator check is safe because it can be verified on any replica. If we tried to do this externally to the reactor, like by having an administrator list on Switchboard, replicas could hold different lists and could reach different decisions. Admins at the API layer can gate requests but this would never change how an operation is evaluated internally to the reactor.

## Ordering Consistency

We already have a ruleset to order events in a single stream, but we now need to introduce a specific rule to relate two different streams. Ordering by timestamp is the base order, but then we need a few new rules:

1. Auth scope operation timestamps must strictly increase, and are rejected otherwise. This is unlike all other scopes, but requires a human decision about required security guarantees. That is: we cannot resolve an auth decision on the basis of, for instance, which way a hash function leans.

2. In timestamp tie breakers, Auth scope operations win.

3. For all other streams, we use a similar ruleset as reshuffle: timestamp, then action id, then operation id. No local-only information like logical index.

## Implementation

Enforcement happens in two places with one evaluator: admission (before a new operation is written), and replay (when synced history is applied). Both of these are inside of the `IJobExecutor` implementation.

### Admission

New mutation jobs are evaluated in `SimpleJobExecutor.executeRegularAction`, between the write-cache load and the reducer.

`buildDecisionModel` folds the model from the local streams' current heads and returns the append condition. A deny rejects the job with `AuthorizationDeniedError` before anything is written. The executor's current, separate `isDeleted` check is pulled into the decision model (fixing a bug that's been around for awhile...).

On allow, the reducer runs and the operation goes to `IOperationStore.apply` with the append condition. Inside the append transaction, the store verifies every stream in the condition is still at its recorded revision. If any has grown, it throws `AppendConditionFailedError` and writes nothing. The job then retries. This will rebuild the model, re-decide, and re-append. A condition failure is a concurrency conflict, not a fault, which is why retry is safe.

This is optimistic locking. That is, the expected-revision check the store already performs for the written stream, extended to the streams the decision read. The queue already serializes jobs per document, so the target's own streams cannot grow between fold and append. The condition exists for group documents, which run on other queue keys and workers, where a membership write can be changed during the write.

### The guard query

The condition compiles into the insert statement itself, as a `WHERE NOT EXISTS` guard — the check and the append are one atomic statement. This condition:

```typescript
{
  streams: [
    { documentId: "doc-123",  scope: "document", branch: "main", revision: 4 },
    { documentId: "doc-123",  scope: "auth",     branch: "main", revision: 7 },
    { documentId: "phd…las",  scope: "global",   branch: "main", revision: 12 },
  ],
}
```

generates

```sql
INSERT INTO "Operation" (...)
SELECT ...   -- the operation's column values
WHERE NOT EXISTS (
  SELECT 1
  FROM "Operation"
  WHERE (("documentId" = 'doc-123' AND "scope" = 'document' AND "branch" = 'main' AND "index" > 4)
      OR ("documentId" = 'doc-123' AND "scope" = 'auth'     AND "branch" = 'main' AND "index" > 7)
      OR ("documentId" = 'phd…las' AND "scope" = 'global'   AND "branch" = 'main' AND "index" > 12))
);
```

If no read-set stream has grown, `NOT EXISTS` passes and the operation is appended. If any stream has grown, the statement inserts zero rows and the store throws `AppendConditionFailedError`. The internal retry mechanism then rebuilds the model from current stream heads. Each disjunct in the subquery is a range probe on the existing `unique_revision` index (`documentId, scope, branch, index`), so there is one fast lookup per stream.

#### Note: On Advisory Locks

Since we're using Postgres, under "Read Committed" isolation mode (the default), this can lead to [write skew](https://www.cockroachlabs.com/blog/what-write-skew-looks-like/) (fyi, switching to Serializable doesn't really save us anything as then we'd need to handle serialization errors). Specifically, a write to the group stream can happen at the same time as the write to the domain (i.e. "global" or other scope) stream. This is allowed because the write and read do not do not conflict on an `insert`, they can only conflict on `update`-- that is, there is no row that is affected by both the read and the write.

Postgres advisory locks are a good fit for this situation. They allow us to create a lock with application-specific semantics. In this case, the `apply` takes an advisory transaction lock per stream, keyed by `(documentId, scope, branch)` and released when the transaction ends. It does this for the stream it writes and every stream in its read-set (acquired in sorted order to avoid deadlock). A concurrent write would then be committed either strictly before the guard, which then sees the new head and fails the append, or strictly after the commit, becoming a later operation for re-evaluation to handle. Either way is correct.

#### The Full Process

The annotated, high level process:

```sql
BEGIN;

-- 1. serialize against concurrent appends on every involved stream,
--    in sorted key order
SELECT pg_advisory_xact_lock(hashtext('doc-123:auth:main'));
SELECT pg_advisory_xact_lock(hashtext('doc-123:document:main'));
SELECT pg_advisory_xact_lock(hashtext('doc-123:global:main'));
SELECT pg_advisory_xact_lock(hashtext('phd…las:global:main'));

-- 2. the existing expected-revision check for the written stream (already in apply today)
SELECT max("index") FROM "Operation"
WHERE "documentId" = 'doc-123' AND "scope" = 'global' AND "branch" = 'main';

-- 3. application: must equal revision - 1, else throw RevisionMismatchError

-- 4. append, guarded by the condition in the same statement
INSERT INTO "Operation" (...)
SELECT ...
WHERE NOT EXISTS (
  SELECT 1
  FROM "Operation"
  WHERE (("documentId" = 'doc-123' AND "scope" = 'document' AND "branch" = 'main' AND "index" > 4)
      OR ("documentId" = 'doc-123' AND "scope" = 'auth'     AND "branch" = 'main' AND "index" > 7)
      OR ("documentId" = 'phd…las' AND "scope" = 'global'   AND "branch" = 'main' AND "index" > 12))
);

-- 5. application: zero rows inserted -> throw AppendConditionFailedError

COMMIT;
```

### Replay

Load jobs (used by sync and replay) evaluate auth for every operation at its position in the merged order: the model is the read-set streams folded to that point. We must re-evaluate the `decide` on load jobs in the case that an operation allowed on a remote is denied locally. This also means that we need to store auth failures from load jobs, rather than simply throw an error like an auth failure on mutation jobs: because a later-arriving but earlier sorting operation may flip the auth check.

Error operations are already skipped for domain reducers, and we'll need to add this same skip for auth errored operations, so that a logged auth deny does not change a document's state (projection). This will advance the stream which could fail a different in-flight append. However, this is a concurrency issue and is already handled by the internal retry.

### Re-evaluation

When a reshuffle happens, the tail from the first change must be re-evaluated, because auth decisions could flip in either direction: an allowed operation becomes denied once an earlier revocation arrives, or a denied one becomes allowed once an earlier grant arrives.

Re-evaluation is a reshuffle-style re-append. If any decision changes, the tail from the first change is re-emitted as new operations: same `opId` and action id, but fresh indexes with skip.

A pass that changes nothing emits nothing.

The re-append advances the stream heads, so a concurrent admission that read the old tail fails its append condition and retries. It also propagates the result: re-emitted operations reach every remote through the normal reshuffle rebroadcast. Receivers do everything they already do: re-evaluating validity and re-executing reducers.

#### Caveats

Re-evaluation runs in two places.

When the loaded stream and the affected streams belong to the same document (an auth or document operation arrived, and the domain streams must be re-evaluated) the work runs inside the same load job, which already holds that document's execution slot. That is, the queue already serializes operations to the same document. When the loaded stream belongs to a group document, the affected documents are other documents, and each is re-evaluated in its own job.

Re-evaluation walks the affected tail once, so it costs about as much as loading the document with no caches. Two existing limits must account for this. The load-job timeout must allow for the extra work. The excessive-shuffle guard must not count re-evaluation re-appends, since a revocation over a long history legitimately supersedes many operations. Otherwise a policy operation would dead-letter simply because the document has a long history, and busy documents would become revocation-proof.

### Semantics

Locally, in `reactor.mutate()`, auth enforcement is preventive. That is, the append condition rejects any decision whose read-set changed before commit, so nothing invalid is committed on this node.

Across reactors, in `reactor.load()`, it is convergent. This means that a decision invalidated by remote writes is caught by re-evaluation when they arrive as new operations. This means that a locally-accepted operation is provisional until the read-set streams settle. Once all replicas hold the same operations, they agree on every decision, which is the same contract reshuffle already imposes on document state, extended to authorization.

### Synchronization

Currently, synchronization is fully tied to drive membership, either through reactor-drive or document-drive. We do this through a mechanism **collections**, which essentially flatten the list of all operations on all documents in a drive. Collections are _forward-calculated_, meaning that we can determine the contents of a collection in the write model (i.e. in the write side of the CQRS partition) so that we can guarantee collections are built correctly before read-models can even read the operation from the log.

This is a very strong guarantee. In fact, when using a Postgres store, collection membership is in the same transaction as the operation that changes it: `CREATE_DOCUMENT` adds the new document to the relevant drive collections, and relationship operations like `ADD_RELATIONSHIP` and `REMOVE_RELATIONSHIP` add and remove members. After an operation is commited, on the read side of the CQRS partition, the sync manager places the operation in the outbox of every remote subscribed to the collection. When a document joins a collection after the collection already has history, sync backfills that history to the collection's remotes. In short, collections allow use to synchronize a single, flattened list of operations using a single, per-channel cursor.

With the introduction of the ph-group, however, we are creating a synchronization dependency between arbitrary documents. That is, for a replica to fully evaluate auth claims that references a group, it must be able to also build the group.

Groups fit the shape of collections because the set of groups a document requires changes only when its auth stream changes, and auth operations pass through the same write path as everything else. When an auth operation commits, the executor can extract the named group ids and inserts them into the collection in the same transaction.

```typescript
// The group ids named by { group } principals in an auth action's input.
// INITIALIZE_AUTH contributes the groups named across its grants; SET_GRANT
// contributes the groups named by its one grant; REMOVE_GRANT and MOVE_GRANT
// contribute nothing.
function mentionedGroupIds(action: Action): string[];
```

We will need to add one table to the store, called `group_references`. This will record a direct lookup from document to group. Because a group's auth scope cannot reference another group (see Actions), references never chain. This means that the groups a document requires are exactly the rows recorded for it.

The table is read in three places: when an auth operation commits, when a document joins a collection, and when a group stream loads. These moments are outlined in more detail below, but all three exist in the write model.

The sync manager (on the read side of the partition) never reads this table. Placing a committed operation into outboxes remains a membership lookup against `document_collections`. The `group_references` table is reread only at the three moments above, never per operation.

```sql
-- new: one row per (document, group) reference ever discovered; rows are
-- never updated or deleted
CREATE TABLE "group_references" (
  "documentId" text NOT NULL,  -- the document whose auth operation names the group
  "groupId"    text NOT NULL,  -- the group document a { group } principal names
  PRIMARY KEY ("documentId", "groupId")
);

-- the reverse direction: from a group to the documents that reference it
CREATE INDEX "idx_group_references_groupId" ON "group_references" ("groupId");
```

Collection membership itself stays where it is, and groups become ordinary rows in it:

```sql
-- existing, unchanged. One row per (document, collection); joinedOrdinal and
-- leftOrdinal bound the window during which the document's operations are
-- served to the collection's remotes.
CREATE TABLE "document_collections" (
  "documentId"    text   NOT NULL,
  "collectionId"  text   NOT NULL,  -- e.g. 'drive.main.drive-9'
  "joinedOrdinal" bigint NOT NULL DEFAULT 0,
  "leftOrdinal"   bigint,
  PRIMARY KEY ("documentId", "collectionId")
);
```

Two statements maintain these tables, and one query consumes them.

#### When an auth operation commits.

Suppose an operation on `doc-123` names the group `g-admins`, and the operation receives ordinal `812` in the operation index. In the same transaction, the executor records the reference and adds `g-admins` to every collection `doc-123` belongs to.

Evaluating auth for `doc-123` requires the `g-admins`' stream and no others, because a group's policy cannot name a further group. Additionally, only `doc-123`'s collections are affected, because an operation that names a group can only commit on a document that is not itself a group, so no other document folds `doc-123` as a member list.

```sql
-- 1. record the reference; rediscovering a known reference changes nothing
INSERT INTO "group_references" ("documentId", "groupId")
VALUES ('doc-123', 'g-admins')
ON CONFLICT DO NOTHING;

-- 2. g-admins joins every collection doc-123 belongs to
INSERT INTO "document_collections" ("documentId", "collectionId", "joinedOrdinal")
SELECT 'g-admins', dc."collectionId", 812
FROM "document_collections" dc
WHERE dc."documentId" = 'doc-123'
ON CONFLICT ("documentId", "collectionId") DO UPDATE
SET "joinedOrdinal" = LEAST("document_collections"."joinedOrdinal", EXCLUDED."joinedOrdinal"),
    "leftOrdinal"   = NULL;
```

An operation that names several groups runs the second statement once per group id.

The `ON CONFLICT` clause carries two important rules. `LEAST` keeps the earliest join, so a rediscovered reference can never shrink a backfill window that remotes already rely on. Setting `leftOrdinal` to `NULL` reopens membership. This means that the group may once have been an ordinary member of the drive and been removed, but a policy reference is not a removable membership, so the reference wins. For the same reason, the join against `document_collections` does not filter on `leftOrdinal`. S document that has left a collection _still has served history inside its window_, and remotes holding that history still need that information.

#### When a document joins a collection.

Suppose `doc-123` is added to drive `drive-9` on `main` at ordinal `951`. In this case, we need to, in the same transaction, also add the groups that `doc-123` has ever referenced as well.

```sql
INSERT INTO "document_collections" ("documentId", "collectionId", "joinedOrdinal")
SELECT gr."groupId", 'drive.main.drive-9', 951
FROM "group_references" gr
WHERE gr."documentId" = 'doc-123'
ON CONFLICT ("documentId", "collectionId") DO UPDATE
SET "joinedOrdinal" = LEAST("document_collections"."joinedOrdinal", EXCLUDED."joinedOrdinal"),
    "leftOrdinal"   = NULL;
```

##### Note

Both statements (`When a document joins a collection` and `When an auth operation commits`) only insert or reopen rows. A `REMOVE_GRANT` mentions no group, so it runs neither, and no path deletes from either table. Deletion is forbidden rather than merely unimplemented. Auth evaluation is positional: if a grant named group G at one position and a later operation removed it, re-evaluating the earlier range still folds G's membership. The obligation is therefore the union of groups referenced anywhere in history, not the set referenced at the head. The cost is that a group referenced once, briefly, stays in the collection. Groups are small documents, and reclaiming stale references is a compaction question, not a correctness one. This spec leaves it open.

Sync does not change: the outbox routes group operations because groups are members, and a newly inserted membership row triggers the same backfill as a late-joining document. A remote can still observe the referencing grant before the group's history finishes arriving. In this case, it will fail closed (deny) for that window and converge when the backfill arrives. This is the eventually consistent design the entire reactor relies on.

#### When a group stream loads.

The first two statements exist so that sync delivers group operations to every replica that needs them. This query runs when those operations arrive.

Suppose an operation arrives on `g-admins` itself, and it removes a member. Any document with a grant naming `g-admins` may now come to different auth decisions. An operation that was allowed because its signer was a member may now be denied and stored as an error operation. Conversely, an operation that was denied may now be allowed. The Re-evaluation section describes how a single document is brought up to date. The only question here is which documents are affected, and the reverse index answers it:

```sql
SELECT "documentId" FROM "group_references" WHERE "groupId" = 'g-admins';
```

The list is complete because a group's auth scope cannot reference other groups. A change to `g-admins` cannot alter another group's member list, so no document outside this list is affected. Each document in the result is re-evaluated in its own job, as the Re-evaluation caveats describe.

This is the second use of `group_references`. Looked up by `documentId`, the table tells sync which groups a document requires. Looked up by `groupId`, it tells auth re-evaluation which documents a group change affects.

References come from the operation's input, not from its outcome (i.e. from the `Action` input, not the `Operation` result). Any operation that names a group contributes a reference, including an operation later stored as an error. This over-approximates, so a denied `SET_GRANT` adds a reference that auth evaluation will never use. In exchange, sync topology is independent of auth evaluation. This means that re-evaluation can flip decisions across a whole tail without a single membership row changing, and a replica knows what to fetch before it has evaluated anything.

A remote can also subscribe to a single document rather than a collection. The obligation is the same: the remote must receive the document's recorded references, read from `group_references` when the subscription is established and as new references are inserted.

Naming a group publishes its membership. Serving a group through a collection means every subscriber of that collection receives the group's member list, whatever the group's own read grants say. This is deliberate, and it is the posture the Reads section already takes for the `auth` and `document` scopes: state that replicas must fold in order to evaluate auth cannot be withheld from them without breaking convergence. A group is fit for policies whose audience may see its roster; a group whose membership must stay confidential should not be named in a grant.

## Groups

A `PHGroup` (`@powerhousedao/document-group`) is an ordinary document whose state is a member address list, gated by its own auth scope. A `{ group }` principal names a group document id.

A group's own auth scope cannot contain `{ group }` principals; the `AuthActionHandler` rejects them on group documents (see Actions). A group's policy names signers directly — `{ address }`, `{ anyone }`, `{ match }` — so membership never chains through a second group, and evaluating auth for a group's operations requires no stream beyond the group's own.

Group streams get no special rule. The `groups` projection names them in the auth scope's grant list, which puts them in the read-set, and every stream in the read-set is folded by position in the same merged order. The fold respects auth evaluation: a membership write that the group's own policy denies is an error operation and contributes nothing. Membership operations sort against the target document's operations by timestamp like anything else, and every replica holding the same operations answers the membership question identically and deterministically.

The read-set is therefore a sync obligation. A grant that names a group makes that group document part of what an enforcing replica must hold; the Synchronization section describes how that obligation is met. A load into a group stream re-evaluates every document whose grants reference it, each in its own job, using the reverse direction of the same group-reference relation. A replica that does not yet hold a group's history fails closed: the member list is empty, so the principal does not match. It converges when the stream arrives. Access is never widened by a missing group. A grant can also name a group that no reachable remote holds, such as a typo or a group that lives elsewhere. In that case the same fail-closed posture holds indefinitely, and the write side can warn at admission that it holds no such document.

## Reads

Everything in this spec so far evaluates operations. A read produces no operation. It has no position in any stream, so there is nothing for admission to gate, nothing for replay to re-evaluate, and nothing for an append condition to guard. The machinery above cannot see reads at all.

Read enforcement therefore lives on the reactor's own read surface, not in the servers built on top of it. Every read on the reactor client carries a subject. The client defaults it to its own signer, and a server passes the authenticated caller. The read functions evaluate `decide` with a `read` request against a model built from the current stream heads, and filter out the scopes the subject may not read. The sync manager applies the same filter per remote, because serving operations to a peer is a read on behalf of that peer. A custom subgraph or a custom server that reads through the reactor client inherits all of this and cannot forget to enforce.

Internal consumers are inside the trust boundary and see everything. The event bus still dispatches all operations, and read models and processors need unfiltered data to build their projections. Whatever they re-expose is their own read surface to gate.

This placement changes the timing guarantee. An operation is evaluated at its position, so a revocation catches even operations that were accepted before it arrived. A read is evaluated at the moment it is served, so revoking read only stops future serving. It cannot recall bytes a replica already holds.

One exemption is required. Suppose a policy could deny reading the `auth` scope itself. A peer could then sync a document without its policy, see an uninitialized auth scope, and allow every operation it holds. Replicas would diverge permanently. The `auth` and `document` scopes therefore bypass the grants: the policy and the document's metadata are visible to any holder of the document. Grants gate domain-scope reads only. A replica denied a domain scope never receives that stream, so it never holds or evaluates it, and partial replication stays consistent.

The same reasoning extends to groups. A replica must fold a group's membership to evaluate auth with it, so a group document named by a policy is served to that policy's audience regardless of the group's own read grants (see Synchronization).

## Administration and bootstrap

A document's policy begins with `INITIALIZE_AUTH` (see Actions). On acceptance, the signer's key is stored in the auth state as `creator`. The header is consulted only once, at this binding. From then on, the creator check in `decide` reads the stored key. A document that never runs `INITIALIZE_AUTH` has an uninitialized auth scope and stays open, so existing documents are unaffected.

**Auth on an unsigned-header document does not resist an adversary.** An unsigned-header document has no creator, so its genesis is open. Anyone can run `INITIALIZE_AUTH` first, and anyone can backdate one that retroactively re-evaluates the whole history under a policy of their choosing. A document that wants an enforceable policy is created with a signed header, ideally with `INITIALIZE_AUTH` in its create batch.

Migration maps a legacy table owner to an `execute`-on-`auth` grant.

## Implementation plan

The rollout has four stages. Each stage ships on its own and changes no behavior until the stage that turns it on.

**Stage 1: data model, backward compatible (mostly done).** Fill out `PHAuthState` and backfill legacy documents so an empty `auth` loads as an empty policy. Ship the four auth actions and the `AuthActionHandler`, with `UNDO`, `REDO`, and `PRUNE` rejected on the auth scope. The policy is now state that replicates with the document and is not yet consulted by anything. Remaining work: auth operations must survive document save/load and versioned replay. An interim admission gate that reads this state directly also exists on the branch; stage 4 absorbs it into the model.

**Stage 2: the decision model surface.** Introduce the types: `StreamQuery`, `Projection`, `DecisionContext`, `DecisionModel`, `AppendCondition`, and `buildDecisionModel`. Extend `IOperationStore.apply` to accept an append condition: the guarded insert, the per-stream advisory locks, and `AppendConditionFailedError`. A condition failure retries by rebuilding the model and does not count toward the job's failure limit. No model is registered, so nothing changes behavior. This stage is proven with store-level tests: a failed condition inserts nothing, lock acquisition cannot deadlock, and a retry lands against the new heads.

**Stage 3: register the first model, document stream only.** One projection over the `document` stream and a `decide` that denies when the document is deleted. The executor now builds the model and calls `decide` at admission for the first time, which replaces the `isDeleted` check and retires the document meta cache. The replay half arrives in its smallest form: load jobs evaluate auth for operations at their merged position, denied operations are stored as error operations, and a load into the document stream re-evaluates the domain streams. The exit test: a backdated `DELETE_DOCUMENT` arriving by sync denies the operations that sort after it, on every replica, while operations before it survive.

**Stage 4: expand the model.** Grow the registered model one projection at a time.

1. The `auth` projection. `decide` gains the uninitialized, creator, and grant steps, and grants are enforced at admission and replay. The interim auth gate is deleted. Reads and the sync manager filter against the same model. This step brings the monotonic-timestamp rule for the auth stream, the excessive-shuffle exemption for re-evaluation, and the load-path work for evaluating multiple streams in one job. Exit: two reactors that accept conflicting auth and domain operations offline converge to identical decisions and identical state after sync, in both directions, and a revocation over a history longer than the excessive-shuffle bound completes without dead-lettering.
2. Conditions. The `where` and `match` evaluators turn on. Conditional grants begin to apply only here.
3. The `groups` projection. Ship the `PHGroup` model, derive group queries from the grant list, add group streams to the read-set and the append condition, maintain the group-reference relation so sync carries referenced groups and re-evaluation finds dependent documents (see Synchronization), and re-evaluate dependents in their own jobs. Group principals begin to match only here. Exit: a group-gated operation syncs to a replica that does not hold the group document and fails closed there until the group's history arrives, after which both replicas agree; and a membership removal denies later operations on every document that references the group.

Registering decision models beyond auth is out of scope. The types are model-agnostic, so that work is registration, not new semantics.

## Worked example: a revocation race

A document grants the legal-assistant group `execute` on the global scope. Reactor A and reactor B both hold the document and are offline from each other.

1. On reactor A, the administrator executes `REMOVE_GRANT` for the group at 10:00.
2. On reactor B, a legal assistant executes `SET_STATUS` at 10:05. B's admission gate allows it — B has not seen the revocation.
3. The reactors sync.

Both replicas now merge the streams and re-evaluate. The revocation sorts first (10:00 < 10:05). At `SET_STATUS`'s position, the grant list no longer contains the group grant, so the decision is deny. On both replicas — including B, which originally accepted it — `SET_STATUS` becomes an error operation: still in the log, no state effect. The assistant's client sees its provisional operation fail after sync, which is ordinary local-first behavior.

The alternative — evaluating an operation once at its origin and pinning that decision forever — would let `SET_STATUS` survive everywhere despite the earlier revocation. Both outcomes are deterministic; this spec deliberately chooses the one where revocation wins.

## Worked example: a toll statement

This is a TRP toll statement. The operation names are illustrative — the model is not built yet — but the shape is real. Keep one line clear: which status transitions are legal is the reducer's job (a domain invariant); who may act, and when, is the policy's job. Statements are created by the ingest service, so that service's key is each statement's governance root, and the human administrator gets in through the first grant below. Legal assistants are a `PHGroup` rather than a list of addresses, so hiring or offboarding one is a single membership operation on that group — every statement picks it up at its next decision, with no per-statement writes.

```json
{
  "version": 0,
  "grants": [
    // the site administrator governs the policy and can act anywhere
    { "id": "g-admin", "description": "Site administrator: full governance", "effect": "allow",
      "principal": { "address": "0x…site-admin" },
      "capability": { "can": "execute", "scope": "*" } },
    { "id": "g-admin-read", "description": "Site administrator: read everything", "effect": "allow",
      "principal": { "address": "0x…site-admin" },
      "capability": { "can": "read", "scope": "*" } },

    // the RTO reads their own statement
    { "id": "g-rto-read", "description": "RTO reads their own statement", "effect": "allow",
      "principal": { "match": { "eq": [ { "attr": "subject.address" },
                                        { "attr": "doc.global.rtoAddress" } ] } },
      "capability": { "can": "read", "scope": "global" } },

    // the RTO may re-upload, but only after a failed extraction
    { "id": "g-rto-reupload", "description": "RTO re-uploads after a failed extraction", "effect": "allow",
      "principal": { "match": { "eq": [ { "attr": "subject.address" },
                                        { "attr": "doc.global.rtoAddress" } ] } },
      "capability": { "can": "execute", "scope": "global", "operation": ["REPLACE_STATEMENT_PDF"] },
      "where": { "eq": [ { "attr": "doc.global.status" }, { "lit": "PROCESSING_ERROR" } ] } },

    // the ingest service reads every statement and writes extraction results while it is processing
    { "id": "g-sys-read", "description": "Ingest service reads every statement", "effect": "allow",
      "principal": { "address": "0x…ingest-service" },
      "capability": { "can": "read", "scope": "global" } },
    { "id": "g-sys-ingest", "description": "Ingest service writes during processing", "effect": "allow",
      "principal": { "address": "0x…ingest-service" },
      "capability": { "can": "execute", "scope": "global", "operation": ["SET_EXTRACTED_FIELDS", "SET_STATUS"] },
      "where": { "in": [ { "attr": "doc.global.status" },
                         [ { "lit": "PROCESSING" }, { "lit": "PROCESSING_ERROR" } ] ] } },

    // legal assistants read every statement and drive review while it is not terminal
    { "id": "g-las-read", "description": "Legal assistants read every statement", "effect": "allow",
      "principal": { "group": "phd…las-staff-group" },
      "capability": { "can": "read", "scope": "global" } },
    { "id": "g-las-review", "description": "Legal assistants review before terminal", "effect": "allow",
      "principal": { "group": "phd…las-staff-group" },
      "capability": { "can": "execute", "scope": "global",
                      "operation": ["SET_STATUS", "SET_LINE_ITEM_DECISION", "VALIDATE_EXTRACTION"] },
      "where": { "notIn": [ { "attr": "doc.global.status" },
                            [ { "lit": "APPROVED" }, { "lit": "REJECTED" }, { "lit": "NOT_PURSUED" } ] ] } },

    // once terminal, content edits are frozen for everyone; this sits last, so it overrides the allows above
    { "id": "g-terminal-freeze", "description": "Freeze content edits once terminal", "effect": "deny",
      "principal": { "anyone": true },
      "capability": { "can": "execute", "scope": "global",
                      "operation": ["SET_EXTRACTED_FIELDS", "REPLACE_STATEMENT_PDF", "SET_LINE_ITEM_DECISION"] },
      "where": { "in": [ { "attr": "doc.global.status" },
                         [ { "lit": "APPROVED" }, { "lit": "REJECTED" }, { "lit": "NOT_PURSUED" } ] ] } }
  ]
}
```

1. A legal assistant sets the status to APPROVED. From that operation on, `g-las-review` stops applying (its `where` is now false) and `g-terminal-freeze` applies, so the next attempt to edit line items or replace the PDF is denied at admission — and, if it arrives via sync anyway, is denied at its position and recorded as an error operation.
2. To amend an approved statement, the administrator sets the status back to a working value: `g-terminal-freeze` does not list `SET_STATUS`, so it does not block the reopen, and `g-admin` allows it.

Reads run on the same grants — the RTO sees their own statement; the legal-assistant group, the ingest service, and the admin see every statement; and nobody else reads anything.
