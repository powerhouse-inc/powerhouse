# Spec — Attribute-based access control in the auth scope with DCB

## Motivation

Currently, all authorization lies outside of the Reactor (eg - middleware, gql layer, etc) or inside of reducers. This means we often need to implement the same auth logic in multiple places and it imposes restrictions on the types of auth even possible.

This spec pulls authorization into the core Reactor. This allows us to ride on top of all the great guarantees we already provide (event log, synchronization, signatures, etc). It also allows for consistency guarantees that simply cannot be provided for externally.

## Overview

From a high level, we propose expanding the current `auth` scope to hold a stacked list of **grants**. Grants apply either baked in policies or dynamically evaluated conditions to various **principals**. These principals are either specific users or groups of users described by a new `PHGroup` document model (`powerhouse/reactor-group`).

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
  version: number; // policy language version; 0 = uninitialized, genesis sets >= 1
  grants: Grant[];
  creator?: string; // did:key of the genesis signer; set once by INITIALIZE_AUTH
};

type Grant = {
  id: string; // stable; SET_GRANT upserts, REMOVE_GRANT deletes
  description: string; // intent, shows in the audit trail
  effect: "allow" | "deny";
  principal: Principal; // who
  capability: Capability; // what they may do
  where?: Condition; // optional; the grant applies only when this holds
};

type Principal =
  | { anyone: true } // any signer, including anonymous
  | { address: string } // one wallet
  | { group: string } // a PHGroup document id
  | { match: Condition }; // relationship, e.g. subject.address == doc.global.rtoAddress

type Capability =
  | {
      can: "read";
      scope?: string;
    }
  | {
      can: "execute";
      scope?: string;
      operation?: string[];
    };
```

Auth scope actions are applied by a dedicated auth reducer, `applyAuthAction`, which the base reducer dispatches instead of the model reducer. This is the same approach as we've taken with the `document` scope reducer. The resulting state is event-sourced, signed, and replicates with the document, so the policy travels with the document instead of living outside of it.

### Actions

The auth scope has four actions. All are applied by the auth reducer.

```typescript
type InitializeAuthInput = {
  version: number;
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

`INITIALIZE_AUTH` is the genesis operation. It is valid only at auth revision zero and carries the policy's `version` and the document's initial grants. The `version` names the policy language the grants are written in (see Condition language) and must be an integer of at least 1. The auth reducer rejects anything less, because 0 is reserved to mean uninitialized. On a signed document its signer must match the header key, and that signer is stored as `creator` (see Administration and bootstrap).

`SET_GRANT` upserts by `grant.id`. An existing id is replaced in place and keeps its position. A new id appends to the end of the list.

`REMOVE_GRANT` deletes by id. An unknown id is an error.

`MOVE_GRANT` moves an existing grant to `index`, clamping an out-of-range index to the valid range. Order is significant because the last applicable grant wins.

`UNDO`, `REDO`, and `PRUNE` are rejected on the auth scope.

On a `PHGroup` document, `INITIALIZE_AUTH` and `SET_GRANT` reject any grant whose principal is `{ group }`. That is, **a group's auth scope cannot reference other groups**. The auth reducer checks the document's own type, so the check is deterministic on every replica. We need this restriction to prevent reference cycles and to keep the systems that follow group references simple rather than potentially recursive (see Groups and Synchronization).

### Grants

The list of `Grant` objects defines a policy. Each grant is applied on top of the previous one. This allows for situations where you might want to deny all access by default and only allow specific capabilities (or vice-versa).

`Principal` objects define who is allowed to perform a `Capability`.

`Capability` objects define the explicit grant. Wildcards can be used for `scope`, or it may be omitted.

```typescript
{
  version: 1,
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

This policy needs a creator to be legal: the blanket `g-lockdown` denies `execute` on every scope including `auth`, and the group grant is not administration v1 can reach, so a creator-less document would be rejected as born locked out (see Unsigned documents).

### Condition language

Conditions must be deterministic, total (meaning that they must _never throw_, given any state shape), pure, JSON-serializable, and versioned by `PHAuthState.version`. An evaluator object consumes these conditions and is a small pure function in `shared/document-model`.

```typescript
export type Condition =
  | { eq: [Operand, Operand] }
  | { ne: [Operand, Operand] }
  | { in: [Operand, Operand[]] }
  | { notIn: [Operand, Operand[]] }
  | { lt: [Operand, Operand] } // numbers and strings; mixed types -> false
  | { lte: [Operand, Operand] }
  | { gt: [Operand, Operand] }
  | { gte: [Operand, Operand] }
  | { exists: Operand }
  | { and: Condition[] }
  | { or: Condition[] }
  | { not: Condition };

export type Operand =
  | { attr: string } // "doc.global.status", "subject.address", "action.input.newStatus"
  | { lit: string | number | boolean | null };
```

A path that does not resolve yields undefined, as does a path resolving to an object or array. Every comparison involving undefined is false. Exists tests presence explicitly. Numbers compare numerically and strings by code point.

`INITIALIZE_AUTH` and `SET_GRANT` validate the grants they carry:

- A policy can hold at most 100 grants.
- A condition tree can be at most 100 nodes with depth at most 10./
- An execute capability lists at most 100 operations.
- Rejects a path that names a scope other than the capability's own (this is because conditions read only the executing scope and such a path can never resolve).

These caps exist because every replica re-evaluates the policy at every operation's position.

These validation rules are part of what a `version` means. Version 1 ships its rules complete and never changes them, because accepted operations are permanent history that every replica must fold identically. Any rule changes require a new version. A replica that encounters a policy version newer than it supports fails closed: every request is denied except the creator's administration of the auth scope, until the software knows that version.

## Projections and the Decision Model

We define the following types to support the DCB pattern:

```typescript
type StreamQuery = { documentId: string; branch: string; scope: string };

// A projection names a stream. Its value in the model is that scope's state
// from the rebuilt document, e.g. PHAuthState for an auth query.
type Projection<M> = {
  // static, or derived from already-folded projections; this is how
  // projections compose
  query: StreamQuery | ((model: Partial<M>) => StreamQuery[]);
};

// the scope's state at the operation's index
type DecisionContext = { scopeState: unknown };

type DecisionModel<M> = {
  projections: { [K in keyof M]: Projection<M> };
  decide(
    model: M,
    subject: Subject,
    request: Request,
    ctx: DecisionContext,
  ): "allow" | "deny";
};
```

A projection defines no reducer of its own. Applying a stream's operations is what the reactor already does when it rebuilds a document, using the reducers this spec has already named: model reducers for domain scopes, the auth reducer, and the document handler. A projection's value in the model is the named scope's state from that rebuild, so the `document` key holds `PHDocumentState` and the `auth` key holds `PHAuthState`. A derived query that returns several streams yields a map from document id to state. Keeping one implementation means skip handling and hash rules live in the rebuild path and the decision model inherits them. A denied operation is the exception, because nothing in the rebuild path checks for one today (see "The outcome belongs on the operation").

A derived query may read only projections whose own queries are static. For instance, we may need to generate queries based on group streams. However, we only allow this one layer deep as a simple guard against potential cycles. The auth model fits this limit exactly: a group's auth scope cannot reference another group (see Actions), so group-derived queries never need a second layer.

Building the model at the head reads each stream's state and records the revision each read observed. Neither is new machinery: the write cache already returns a document's state at a revision, so this is one `IWriteCache.getState` call per stream plus a record of what it read. Those recorded revisions are what the append condition guards.

Evaluating at an earlier position works differently. A position in the merged order is a timestamp, and `getState` bounds by index, so a replay walks the read-set streams forward in timestamp order instead of reading each position directly (see "A position is a timestamp, not a revision").

```typescript
type DecisionTarget = { documentId: string; branch: string };

// we need to fail the append if any of these streams has operations past `revision`
type AppendCondition = {
  streams: Array<{
    documentId: string;
    scope: string;
    branch: string;
    revision: number;
  }>;
};

function buildDecisionModel<M>(
  store: IOperationStore,
  definition: (target: DecisionTarget) => DecisionModel<M>,
  target: DecisionTarget,
): { model: M; appendCondition: AppendCondition };
```

The append condition, as described before, is the model's read-set. It has one entry per stream the projections read, and stores the revision it read to. This allows us to guarantee that the state of the document's scope applied by the reducer holds only as long as none of these streams has grown. The store enforces this at write time (see Enforcement), so a decision can never be committed against streams that changed during the reducer execution.

Reading through the cache puts the cache's contract in the auth trust base. Every mutation already builds its document through the same cache, so the dependency is not new, but a decision relies on two specific guarantees from it that are described under Admission.

The full auth decision model composes three projections, and we can see easily how we might incrementally add the projections to the decision model to roll out this feature. There are two projections over the target document (i.e. we need `document` and `auth` streams), and a set of projections over the referenced group documents:

```typescript
const AuthDecisionModel = (
  target: DecisionTarget,
): DecisionModel<{
  document: PHDocumentState;
  auth: PHAuthState;
  groups: Record<string, PHGroupState>; // group document id -> state
}> => ({
  projections: {
    document: {
      query: {
        documentId: target.documentId,
        branch: target.branch,
        scope: "document",
      },
    },
    auth: {
      query: {
        documentId: target.documentId,
        branch: target.branch,
        scope: "auth",
      },
    },
    groups: {
      query: (model) =>
        referencedGroupIds(model.auth.grants).map((id) => ({
          documentId: id,
          branch: "main",
          scope: "global",
        })),
    },
  },
  decide(model, subject, request, ctx) {
    /* the decision algorithm below */
  },
});
```

The `document` projection is intended to replace the current metadata cache used for document versioning and the `isDeleted` check. This is the special-case consistency cache that is already present -- but can be removed when transitioning to DCB.

The `auth` projection rebuilds the grant list from the auth event stream.

The `groups` projection is the most complicated, and should be the last to introduce. Its stream set is derived from the auth scope state (the auth projection's folded state), so adding a grant that names a new group pulls that group's stream into the model. Group queries pin the `main` branch. A group's member list lives on its main branch no matter which branch the referencing document is on. Folding a group's `global` scope requires the `PHGroup` document model to be registered, and it ships with the platform.

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

2. if the auth scope is uninitialized (version == 0, i.e. no genesis operation):
      return ALLOW                    # legacy: a document with no policy is unaffected

3. if request is an execute in the "auth" scope
      and subject is the creator (model.auth.creator):
      return ALLOW                    # administration can never be locked out of itself

4. if model.auth.version is newer than this software supports:
      return DENY                     # fail closed until the software knows the policy language

5. decision = DENY                    # default-deny once a policy exists
   for grant in model.auth.grants, in order:
      if covers(grant.capability, request)
         and matches(grant.principal, subject, ctx)
         and (grant.where is absent or eval(grant.where, ctx)):
            decision = grant.effect    # "allow" or "deny"; the last applicable grant wins
   return decision


covers(grant, request):
   scopeReaches(grant.capability.scope, request.scope)
   and (
      # the verb the grant names
      (grant.capability.can == request.verb
       and (request.verb == "read"                        # a read has no operation
            or grant.capability.operation is absent       # execute: absent = every operation
            or request.operation in grant.capability.operation))
      # or an allow on execute, which carries the read of that scope with it
      or (request.verb == "read"
          and grant.effect == "allow"
          and grant.capability.can == "execute")
   )

scopeReaches(scope, requested):
   scope is absent or scope == "*" or scope == requested

matches(principal, subject, ctx):
   { anyone: true }      -> true
   { address }           -> principal.address == subject.address, compared case-insensitively
   { group }             -> membership folded at the operation's position (see Groups)
   { match: Condition }  -> eval(Condition, ctx)
```

Deletion is evaluated at position like everything else, rather than absolutely, like the current Reactor implementation. This means that an operation that sorts before the `DELETE_DOCUMENT` still applies, and everything after it denies, across every replica.

The grants are a stack. A capability that omits `scope` (or sets it to `"*"`) covers every scope. An `execute` capability that omits `operation` covers every operation in its scope.

Executing an operation means reading the state it applies to, so an allow on `execute` also allows reading that scope. The converse does not hold: reading is the lesser power and confers no write. Two exclusions keep the implication from reaching further than that. A `deny` on `execute` withholds the write and says nothing about the read, or a policy locking writes down would silently revoke a read grant standing before it. And the `operation` list is not consulted for a read, because it restricts which operations may be executed rather than whether the scope is visible -- consulting it would mean a narrowed execute grant conferred less read than a broad one.

This makes the shape of an administration grant matter. A grant of `execute` on `"*"` now also serves every scope of the document to whoever it names, so a policy that means "administration stays reachable" should name the `auth` scope, which is all the retention rule requires.

A grant that uses a feature that doesn't yet exist never applies. For instance, `{ group }` principals, `{ match }` principals, and `where` conditions will not apply in grants until the actual feature evaluator exists. Skipping an allow withholds access, so an unevaluated allow can never widen a policy. Skipping a deny withholds nothing: a policy that relies on a conditional or group-scoped deny is weaker than written until the feature it uses is live.

The creator can always execute `auth` operations, even against a grant list that tries to deny them, so that a document can never be bricked by locking out its own creator. However, this is deliberately narrow, covering only `auth`-scope execution. The creator gets no special access to domain operations or reads.

This creator check is safe because it can be verified on any replica. If we tried to do this externally to the reactor, like by having an administrator list on Switchboard, replicas could hold different lists and could reach different decisions. Admins at the API layer can gate requests but this would never change how an operation is evaluated internally to the reactor.

## Ordering Consistency

We already have a ruleset to order events in a single stream, but we now need to introduce a specific rule to relate two different streams. Ordering by timestamp is the base order, but then we need a few new rules:

1. Auth scope operation timestamps must strictly increase, and are rejected otherwise. This scenario bubbles up as an exception, not a logged operation. This is unlike all other scopes, but requires a human decision about required security guarantees. That is: we cannot resolve an auth decision on the basis of, for instance, which way a hash function leans.

2. In timestamp tie breakers, Auth scope operations win.

3. For all other streams, we use timestamp, then action id, then operation id. No local-only information like logical index.

## Implementation

Enforcement happens in two places with one evaluator: admission (before a new operation is written), and replay (when synced history is applied). Both of these are inside of the `IJobExecutor` implementation.

### Admission

New mutation jobs are evaluated in `SimpleJobExecutor.executeRegularAction`, between the write-cache load and the reducer.

A decision reads through the write cache, so it depends on two guarantees the cache makes. A stored snapshot does not change after it is stored, so a decision reading an earlier position does not see a delete that had not happened there. And a read for the head is answered only by a snapshot recorded as the head, so an evaluation does not depend on which reads happened to warm the cache. Neither is auth-specific, since any positional read can reach them, and both were fixed before this stage began.

`buildDecisionModel` folds the model from the local streams' current heads and returns the append condition. A deny rejects the job with `AuthorizationDeniedError` before anything is written. The executor's current, separate `isDeleted` check is pulled into the decision model (fixing a bug that's been around for awhile...).

On allow, the reducer runs and the operation goes to `IOperationStore.apply` with the append condition. Inside the append transaction, the store verifies every stream in the condition is still at its recorded revision. If any has grown, it throws `AppendConditionFailedError` and writes nothing. The job then retries. This will rebuild the model, re-decide, and re-append. A condition failure is a concurrency conflict, not a fault, which is why retry is safe.

This is optimistic locking. That is, the expected-revision check the store already performs for the written stream, extended to the streams the decision read. The queue already serializes jobs per document, so the target's own streams cannot grow between fold and append. The condition exists for group documents, which run on other queue keys and workers, where a membership write can be changed during the write. It also protects multi-instance deployments. Two reactors sharing one database have no shared queue, so nothing serializes their jobs against each other. The advisory locks and the guarded insert are what make that safe, which is why they are required rather than optional hardening.

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

Load jobs (used by sync and replay) evaluate auth for every operation at its position in the merged order: the model is the read-set streams applied to that point. We must re-evaluate the `decide` on load jobs in the case that an operation allowed on a remote is denied locally. This also means that we need to store auth failures from load jobs, rather than simply throw an error like an auth failure on mutation jobs: because a later-arriving but earlier sorting operation may flip the auth check.

#### A position is a timestamp, not a revision

A position in the merged order is a timestamp. The rows a stream stores are ordered by index, and the two are not the same order, because a row the store holds is not necessarily a row that still counts. A reshuffle appends the merged range and puts a skip on its first operation, superseding the rows it replaced rather than rewriting them, so the stored rows keep both the old order and the new one.

The operations that count are the ones left after those skips are applied. Call that the effective stream. On it the two orders agree, because a reshuffle writes the range in merged order, and a reshuffle is what happens whenever an incoming operation sorts before something already stored.

The rule is therefore stated on the effective stream:

> A read-set stream is applied, in the order its effective operations run, through every operation whose timestamp is at or before the evaluated operation's. An operation with an equal timestamp in another stream sorts by action id, then by operation id.

A replay evaluates by walking forward rather than by reading each position. One walk visits the read-set streams in that order, carrying the model along, and evaluates each operation against the model as it stood when the walk reached it. Resolving skips first is what makes one walk enough: without it, an operation's position and its place in the stored rows can disagree, and no single forward walk can be correct for both. `IWriteCache.getState` bounds by index over the stored rows, so it cannot express "up to timestamp T" and a point read cannot answer the question at all.

Admission usually reads the head, but not by definition. Timestamps are supplied by the caller and the reactor does not re-stamp them, so an offline or queued client can submit an action timestamped below operations already stored. An action at or above every timestamp in its read-set streams is at the head and a head read is correct; below them, admission takes the same walk a replay takes.

#### The outcome belongs on the operation

An action records what was attempted. A denial records what happened to it. These are separate facts, so the denial belongs on the operation rather than in a rewritten action.

Rewriting the action fails in two ways. Substituting `NOOP` collides with the base reducer, where a `NOOP` carrying a skip is the marker that supersedes earlier operations. `garbageCollectV2` counts those markers and ignores skip magnitude, so a denied operation that also carried a reshuffle skip would retract one operation where it meant to retract several. Introducing a new action type such as `DENIED` avoids that collision but discards what was attempted, and three consumers need it: the client matches its own action id to learn which action was refused, sync deduplicates by action id, and re-evaluation needs the original action to re-append if the evaluation later changes back. Nesting the original action inside a new one keeps those but breaks every consumer that reads `action.type`.

The operation therefore carries an outcome:

```typescript
type OperationOutcome =
  | { kind: "applied" }
  | { kind: "reducer-error"; message: string }
  | { kind: "denied"; reason: string };
```

`applied` is the default and needs no storage. The other two are the ways an operation can occupy an index without contributing state, and they are distinguishable, which `error?: string` alone is not: telling a policy denial from a reducer failure by matching a prefix on a human-readable message would make a consensus decision depend on a message string.

The replay rule follows. An operation whose outcome is `denied` is appended to the history and its reducer is not run, so no action is substituted, no message is inspected, and the garbage collector never sees a synthetic marker. The operation still occupies its index, because removing it would shift every later index and break the guarantee the write cache makes about the last operation, which is what every append condition is measured against. A reducer failure needs no such rule today, since the reducer throws again on every rebuild and the state is preserved without anything checking `error`; a denied operation has no such property because its action is valid.

The outcome affects consensus, since it is persisted, it travels by sync, and a replica that ignored it would apply an action every other replica refused. It therefore rolls out per document-sharing fleet, exactly as the enforcement flags do, which means it cannot ship ahead of the flag that produces it. This is stricter than a new action type would need to be: a replica that does not recognise an action type falls through its model reducer's `default` and leaves state unchanged, which happens to be correct, whereas a replica that ignores the outcome applies the action and diverges.

Storing the outcome is a migration. `Operation` carries `error?: string` today in a `text` column, surfaced over sync and GraphQL. `reducer-error` keeps that column for its message, and `denied` needs storage of its own rather than a reserved prefix inside it.

Writing a deny advances the stream, which could fail a different in-flight append. However, this is a concurrency issue and is already handled by the internal retry.

### Re-evaluation

When a reshuffle happens, the tail from the first change must be re-evaluated, because auth decisions could flip in either direction: an allowed operation becomes denied once an earlier revocation arrives, or a denied one becomes allowed once an earlier grant arrives.

Re-evaluation is a reshuffle-style re-append. If any decision changes, the tail from the first change is re-emitted as new operations: same `opId` and action id, but fresh indexes with skip.

The re-append advances the stream heads, so a concurrent admission that read the old tail fails its append condition and retries. The re-appended operations do travel to other replicas, and do not need to be understood as anything special when they arrive: a receiving replica recognises them by action id, applies nothing, and reaches the same outcome by evaluating its own history against the operation that triggered the pass. Two replicas may therefore store different rows while agreeing on which operations apply and on the state they produce.

Two rules follow from re-appends travelling. The monotonic-timestamp check on an arriving auth operation runs _after_ the action-id dedup, because a re-appended auth operation keeps its original timestamp and so is at or below the receiving replica's auth head by definition — checked before the dedup it would reject traffic both replicas already agree about. And the excessive-shuffle guard does not count an operation whose action id the stream already holds, for the same reason.

A pass visits each evaluated scope once, in the model's projection order. A verdict a pass writes is therefore visible to a later-visited scope and not to an earlier one. The pass is deterministic, so every replica computes the same verdicts from the same history; it is not iterated to a fixed point, so a verdict that would change under the state a later scope produced stands until the next arrival triggers another pass. Convergence between replicas is the guarantee; a fixed point is not.

#### What triggers a pass

Re-evaluation is not a property of loading. It is owed whenever a read-set stream gains an operation that something already evaluated sorts after, since that is exactly when an evaluation can change. A load is the common way that happens, but not the only one.

A locally executed operation can trigger it too. Timestamps are supplied by the caller and the reactor does not re-stamp them, so a mutation can carry a timestamp below operations already stored. `DELETE_DOCUMENT` is the case that matters. The reactor issuing the delete would be the one replica that keeps its own later-timestamped operations in effect, while every replica learning of the delete by sync denies them, leaving the deleting reactor as the sole dissenter. That inverts what enforcement is for.

The trigger is therefore stated on the operation rather than the job:

> A committed operation on a read-set stream owes a re-evaluation pass over the streams that read it, unless it sorts after every operation in those streams. Admission and replay owe this equally.

Note that the comparison is against the streams that read the operation, not the stream it lives in. A deletion is normally the last thing in the document scope while the operations it refuses sit in another scope, so testing its own stream would exempt exactly the case the pass exists for. An operation later than everything that reads it owes nothing, which is the common case, so the ordinary write path stays free.

#### Retracting a tail

A pass that changes an evaluation re-appends the tail from that point, carrying a skip on the first re-appended operation the way a reshuffle does. Retraction never happens on its own, because a denied operation still occupies a position, so no separate marker is needed.

The skip spans from the first retracted index to where the re-appended operation lands, rather than counting the operations retracted. Applying a skip resolves to `skipUntil = index - skip - 1`, and the two numbers agree only while the stream's indices run without gaps. A pass leaves a gap behind, so counting would leave an earlier copy standing beside its own replacement.

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

A `PHGroup` (`powerhouse/reactor-group`) is an ordinary document whose state is a member address list, gated by its own auth scope. A `{ group }` principal names a group document id.

A group's own auth scope cannot contain `{ group }` principals; the auth reducer rejects them on group documents (see Actions). A group's policy names signers directly — `{ address }`, `{ anyone }`, `{ match }` — so membership never chains through a second group, and evaluating auth for a group's operations requires no stream beyond the group's own.

Group streams get no special rule. The `groups` projection names them in the auth scope's grant list, which puts them in the read-set, and every stream in the read-set is folded by position in the same merged order. The fold respects auth evaluation: a membership write that the group's own policy denies is an error operation and contributes nothing. Membership operations sort against the target document's operations by timestamp like anything else, and every replica holding the same operations answers the membership question identically and deterministically.

The read-set is therefore a sync obligation. A grant that names a group makes that group document part of what an enforcing replica must hold; the Synchronization section describes how that obligation is met. A load into a group stream re-evaluates every document whose grants reference it, each in its own job, using the reverse direction of the same group-reference relation. A replica that does not yet hold a group's history fails closed: the member list is empty, so the principal does not match. It converges when the stream arrives. Access is never widened by a missing group. A grant can also name a group that no reachable remote holds, such as a typo or a group that lives elsewhere. In that case the same fail-closed posture holds indefinitely, and the write side can warn at admission that it holds no such document.

## Reads

Everything in this spec so far evaluates operations. A read produces no operation. It has no position in any stream, so there is nothing for admission to gate, nothing for replay to re-evaluate, and nothing for an append condition to guard. The machinery above cannot see reads at all.

Read enforcement therefore lives on the reactor's own read surface, not in the servers built on top of it. Every read on the reactor client carries a subject. The client defaults it to its own signer, and a server passes the authenticated caller. The read functions evaluate `decide` with a `read` request against a model built from the current stream heads, and filter out the scopes the subject may not read. A custom subgraph or a custom server that reads through the reactor client inherits all of this and cannot forget to enforce.

A read builds its model through the read side, never the write cache. The write cache is a write-side projection invalidated by whichever process runs the executor, so a reactor whose executors live in worker processes holds state in its parent that no commit ever invalidates; a read there would decide against a policy arbitrarily far behind the one the write paths enforce. The document being read is what seeds the model, so its own `document` and `auth` streams cost nothing extra and only a group the grant list names is fetched.

The gate is selected by `authEnforcement`, not by whether a model happens to be registered. Below that flag the registered model is the document-only one, which ignores the auth scope entirely, so routing a read through it would serve every domain scope of every policied document to anyone. Below `authEnforcement` a read therefore evaluates the policy alone.

Serving operations to a peer is a read on behalf of that peer, and the subject is available for it. Every authorization decision the host makes is made on an inbound call, and serving a peer is one: the peer polls for envelopes over the same authenticated surface as any other caller, and the address its credential establishes is the subject that read is for. Receiving from a peer is not a read at all — it is a write, refused at its position by admission and replay like any other.

Two things about that subject decide the shape of the work. It is established **per poll, not per channel**: a replication channel carries a client-supplied id and no identity, so consecutive polls on one channel can come from different callers, or from none. And it can be **absent**: a request with no bearer token is not refused, it is admitted with no caller, so an anonymous poll is a subject with no address rather than an error. A serving gate must therefore hold what it withholds rather than consuming it, because the delivery state it would consume is shared across every subject that ever polls that channel.

What the serving path does not yet do is evaluate the policy. It gates against the host's own permission tables, which are a second and older authorization system, and it withholds whole documents rather than scopes. Stages 8 through 10 close that.

Internal consumers are inside the trust boundary and see everything. The event bus still dispatches all operations, and read models and processors need unfiltered data to build their projections. Whatever they re-expose is their own read surface to gate.

Filtering is per scope, and a document carries its scopes in more than one place: `initialState` holds the same scope names as `state`, so both are filtered. A read that narrows scopes has the `auth` scope added back before the fetch, because a model built without the policy reads as uninitialized, which allows everything — the gate must never be handed a document whose policy was filtered out on the way in. Both apply to a subscription's documents exactly as they do to a direct read.

A single-document read of a deleted document serves the state at the deletion boundary rather than nothing, because deletion is positional. A listing does not: `find` and its relatives keep omitting a deleted document, or every drive listing would start returning them. A slug never resolves to a deleted document either, because deleting one destroys its slug mappings, which is what keeps it undiscoverable by name.

This placement changes the timing guarantee. An operation is evaluated at its position, so a revocation catches even operations that were accepted before it arrived. A read is evaluated at the moment it is served, so revoking read only stops future serving. It cannot recall bytes a replica already holds.

An uninitialized policy leaves a document open, which is what keeps existing documents unaffected — but a host may need the opposite default. Hosts exist whose own access control closes a document until something opens it, and for them "no policy" has always meant "closed", not "open". Such a host configures the read surface to withhold every gated scope of an uninitialized document rather than serving it.

That is a second authorization system, deliberately, and it is safe for one reason: it only ever withholds. A read decision is made when the read is served and is never part of any document's history, so a host that serves less than the policy allows is a host that serves less. This is the mirror of why a node-local administrator list is not allowed to widen a read (stage 9): withholding locally costs a caller some data, while granting locally means a replica reaching a conclusion no other replica can verify. The closure lives in the host's configuration rather than in the document, so the same document read from a host without that configuration is open — which is a reason to migrate a policy onto it, not a reason to withhold differently.

One exemption is required. Suppose a policy could deny reading the `auth` scope itself. A peer could then sync a document without its policy, see an uninitialized auth scope, and allow every operation it holds. Replicas would diverge permanently. The `auth` and `document` scopes therefore bypass the grants: the policy and the document's metadata are visible to any holder of the document. Grants gate domain-scope reads only. A replica denied a domain scope never receives that stream, so it never holds or evaluates it, and partial replication stays consistent.

The same reasoning extends to groups. A replica must fold a group's membership to evaluate auth with it, so a group document named by a policy is served to that policy's audience regardless of the group's own read grants (see Synchronization). Four rules bound that:

- Only the group's member list is served. A group's other scopes stay behind its own grants, because the member list is the only thing the audience must fold.
- Only a referencing document's _domain_ scopes decide its audience. Every holder of a document reads its `auth` and `document` scopes, so testing those would serve every referenced group to everybody.
- One level. A referencer that is itself a group is skipped, and a referencer's own readability comes from its policy alone, so a reference cycle terminates. Cycles are reachable even though the reducer forbids a group naming a group: the reference relation is recorded from an operation's input, including an operation later stored denied, so a refused grant leaves a row behind that validation never saw.
- At most a hundred referencers are examined. Each costs a model build and the relation is append-only, so an unbounded scan would make a widely-named group permanently expensive to read. Past the bound the group is withheld, which is the direction that fails closed, and the truncation is logged.

## Administration and bootstrap

A document's policy begins with `INITIALIZE_AUTH` (see Actions). On acceptance, the signer's key is stored in the auth state as `creator`. The header is consulted only once, at this binding. From then on, the creator check in `decide` reads the stored key. A document that never runs `INITIALIZE_AUTH` has an uninitialized auth scope and stays open, so existing documents are unaffected.

**Auth on an unsigned-header document does not resist an adversary.** An unsigned-header document has no creator, so its genesis is open. Anyone can run `INITIALIZE_AUTH` first, and anyone can backdate one that retroactively re-evaluates the whole history under a policy of their choosing. A document that wants an enforceable policy is created with a signed header, ideally with `INITIALIZE_AUTH` in its create batch.

**And it can lock its own auth scope out permanently.** The creator carve-out is what keeps administration reachable, and an unsigned document has no creator to carve out for. A change that leaves no grant permitting `execute` on `auth` therefore makes the auth scope unwritable for good, on every replica, with no recovery path. A policy on an unsigned document must always retain an auth-administration grant. On a signed document the carve-out covers this.

The rule is about _reachability_, not about a grant being present. Evaluation is last-applicable-grant-wins, so an administration grant that a later `deny` shadows keeps nothing reachable, and every way of reordering or adding grants can take administration away without removing it: `REMOVE_GRANT`, a `SET_GRANT` that replaces the grant in place, a `SET_GRANT` that appends a deny covering `auth`, and a `MOVE_GRANT` that reorders the administration grant into shadow. All four are rejected on a creator-less policy, and `INITIALIZE_AUTH` rejects a genesis that is born unreachable. A consequence worth knowing: a creator-less policy cannot carry a blanket `deny` on `execute` for `*`, because that denies its own administration; such a policy has to scope its deny to the domain scopes it means.

A duplicated document inherits its source's policy. Duplication fails when the copy cannot preserve the policy rather than producing a policy that cannot be administered.

**A state snapshot is not a door onto the policy.** `applyAuthAction` is the validated way into `state.auth`, but `UPGRADE_DOCUMENT`'s `initialState` and `LOAD_STATE`'s `data` replace whole scopes at once, and both are authorized as `document`-scope writes. Without a rule there, a subject holding `execute` on `document` and no auth grant could install a policy of its choosing, name itself `creator` (which exempts the policy from retention permanently), or wipe an existing policy by carrying the default uninitialized one. A snapshot's auth scope is therefore resolved rather than assigned: a snapshot with no policy or an uninitialized one leaves the document's own policy standing, an uninitialized document accepts a policy only after the validation genesis applies, and a snapshot reaching an already-initialized document must carry that same policy exactly, grants included. Duplication and import satisfy the last rule because they run against a freshly created document; anything else is an attempt to swap one policy for another.

Migrating a host's own permission tables into grants is stage 9. A table owner needs both a `read` grant and an `execute`-on-`auth` one: the second because a migrated document has no creator to carve out for, so a policy that does not name its own administrator is born locked out.

## Implementation plan

Stages 1 through 6 have shipped, in order: the auth data model with backfill for legacy documents, the four auth actions and reducer, version-1 validation, and persistence through save/load and versioned replay (stage 1); the decision-model surface and the store's append condition (stage 2); the document decision model replacing the document meta cache (stage 3, `documentDecisions`); the auth projection with admission, replay, and re-evaluation (stage 4, `authEnforcement`); group principals — the `powerhouse/reactor-group` model, the derived groups projection, the group-reference relation, and cross-document re-evaluation (stage 5, `authGroups`); and the condition evaluators with position-correct scope state (stage 6, `authConditions`). All four flags default off.

Stage 7, the read path, has shipped too. Reads no longer run through the stage-1 interim gate: with `authEnforcement` on they build the registered model and decide a `read` request per scope, so group principals and conditional grants apply to a read for the first time. One piece of it is a documented limitation, recorded in stage 7 below.

What remains is stages 8 through 10: the reactor client's reads are gated by the policy, but the host built on top of it still has an authorization system of its own — private permission tables that decide sync serving and every other read at the GraphQL boundary. Those three stages move sync serving onto the policy, express the tables as grants, and then retire them. Until they are done, `authEnforcement` cannot be turned on for a fleet that uses those tables, because every document's policy is uninitialized and an uninitialized policy allows everything.

### Feature flags

The reactor configuration carries four flags: `documentDecisions`, `authEnforcement`, `authGroups`, and `authConditions`. Each flag selects an expansion of the registered decision model, and each implies its predecessors — `authGroups` and `authConditions` require `authEnforcement`, which requires `documentDecisions`. All default off. The flags govern enforcement only; the auth data model (actions, reducer, validation, replication) is always live, so a policy authored under any flag configuration is intact once enforcement turns on.

`ReactorBuilder` validates the flag set and throws when there is inconsistent configuration. A flag set without its required predecessors is rejected, and so is a name the running version does not recognize.

A decision made at replay is a consensus outcome: a denied operation carries a `denied` outcome and contributes nothing to the derived state. Two reactors that share documents but disagree on these flags therefore diverge, exactly as two reactors on incompatible software versions would. A flag flips on for a document-sharing fleet, not per node.

**Stage 2: the decision model surface, standalone.** Introduce the types: `StreamQuery`, `Projection`, `DecisionContext`, `DecisionModel`, `AppendCondition`, and `buildDecisionModel`. `buildDecisionModel` reads stream states through the write cache and records the revisions it read, so it introduces no new machinery for applying operations. Extend `IOperationStore.apply` to accept an append condition: the guarded insert, the per-stream advisory locks, and `AppendConditionFailedError`. A condition failure retries by rebuilding the model and does not count toward the job's failure limit. No model is registered and nothing consults the machinery, so no flag is needed and nothing changes behavior. The stage is fully tested standalone: `buildDecisionModel` unit tests cover static and derived queries and revision recording, and store-level tests prove a failed condition inserts nothing, lock acquisition cannot deadlock, and a retry lands against the new heads.

**Stage 3: the document decision model replaces the document meta cache (`documentDecisions`).** One projection over the `document` stream and a `decide` that denies when the document is deleted. The executor builds the model and calls `decide` at admission for the first time, which replaces the `isDeleted` check, and the append condition over the document stream turns stage 2's retry contract live. The replay half arrives in its smallest form: load jobs evaluate the decision model for operations at their merged position, denied operations carry a `denied` outcome, and an operation that does not sort at its stream's head re-evaluates the streams that read it. The exit test: a backdated `DELETE_DOCUMENT` arriving by sync denies the operations that sort after it, on every replica, while operations before it survive.

Positional deletion is the corrected semantics on every reactor, so this stage would not need a flag on its own. It carries one because it changes replay outcomes and therefore has to roll out per fleet like the stages after it. The flag also keeps the document meta cache alive: the cache answers the deletion question while the flag is off, so retiring it, along with `rebuildAtRevision`, the eager `putDocumentMeta` calls, and its slot in `ExecutionStores`, waits until the flag defaults on.

The stage was attempted once and reverted. Four mistakes from that attempt are stated as design above and are the stage's real content: it derived a revision from a timestamp (see "A position is a timestamp, not a revision"), it substituted `NOOP` for a denied action (see "The outcome belongs on the operation"), it retracted a tail by counting the operations rather than spanning the indices (see "Retracting a tail"), and it triggered re-evaluation from the load path alone (see "What triggers a pass"). A fifth problem, the two write-cache guarantees a decision depends on, has since been fixed (see Admission).

Two limits were named here as deliberate and on the read side: `replayDocument` applying a denied operation, and the read surface hiding a deleted document rather than serving the boundary state. Both were in fact closed as this stage shipped, and stage 7 verifies them by exit test rather than building them again.

**Stage 4: the auth projection (`authEnforcement`).**
Expand `decide` to include the `auth` policy. The mechanism that makes this possible is already in place: stage 3's projection reads the `document` scope to evaluate an operation in other scopes at its merged position, and guards the write with an append condition with re-evaluation. Reading the `auth` scope to evaluate a domain write is that same arrangement with a second projection, so this stage adds projections and `decide` steps rather than new cross-scope machinery.

With the flag off, the reactor enforces nothing beyond the stage-1 interim gate on auth-scope writes. That gate is not itself flag-gated, so it stays until `authEnforcement` defaults on; this sentence is not licence to delete it. The auth stream joins re-evaluation here, once the monotonic-timestamp rule says how a re-appended auth operation is ordered.

This stage brings the monotonic-timestamp rule for the auth stream, the excessive-shuffle exemption for re-evaluation, and the load-path work for evaluating multiple streams in one job.

Two reactors that accept conflicting domain operations offline converge to identical decisions and identical state after sync, in both directions, and a revocation over a history longer than the excessive-shuffle bound completes without dead-lettering.

Conflicting auth operations are the deliberate exception, and they do not converge. The monotonic rule is not symmetric: the replica whose auth stream already ran ahead rejects the arrival and dead-letters it, while the replica behind accepts. The two hold different policies until the application reconciles them from the dead letters.

**Stage 5: the groups projection (`authGroups`).** Ship the `PHGroup` model, derive group queries from the grant list, add group streams to the read-set and the append condition, maintain the group-reference relation so sync carries referenced groups and re-evaluation finds dependent documents (see Synchronization), and re-evaluate dependents in their own jobs. Group principals begin to match only here. Until conditions ship, a group's own policy is limited to `address` and `anyone` principals, since `match` never applies. Exit: a group-gated operation syncs to a replica that does not hold the group document and fails closed there until the group's history arrives, after which both replicas agree; and a membership removal denies later operations on every document that references the group.

**Stage 6: conditions (`authConditions`).** The `where` and `match` evaluators turn on. Conditional grants begin to apply only here — for `execute` requests. The read surface does not yet supply a condition context (or a groups map), so a `read` grant that uses `where`, `match`, or `{ group }` still never applies; that lands in stage 7.

**Stage 7: the read path.** Reads are evaluated at serve time rather than at a position, so a read decision is not a consensus outcome and this stage carries no flag of its own — each piece turns on with the flag whose feature it completes (`authEnforcement` for the model unification, `authGroups` for group grants and group serving, `authConditions` for conditional read grants).

Two things in this list turned out to have shipped already, with stage 4 rather than here, and are struck below with the defects that remained in them. One thing in it moved to a stage of its own: filtering what sync serves, which is not blocked on anything but is a larger change than it looked, because the serving path gates against a second authorization system (stage 8).

1. **Route reads through the registered decision model.** The read filter — `filterReadableScopes` in `packages/reactor/src/client/util.ts`, applied by the reactor client's read functions — evaluated the bare policy: no groups map, no condition context, no document projection. It now asks a read gate, which builds the registered model at the stream heads and evaluates a `read` request per scope. With that, `{ group }` and conditional read grants apply for the first time. A read's condition context carries the scope's own state and no action input, so a condition on `action.input.*` never holds for a read. The `auth` and `document` scopes stay exempt (see Reads).

   The gate resolves one predicate per document rather than answering per scope, so the model is built once however many scopes are then tested and the filtering itself stays synchronous. Three things about how it reads are load-bearing, and all three are stated under Reads: it reads through the read side rather than the write cache, it is selected by `authEnforcement` rather than by whether a model is registered, and the document already fetched seeds the model so its own streams cost nothing.

   Two call sites needed more than an awaited predicate. Fetching only the policy is enough to evaluate a policy and not enough to evaluate a condition on the state of the scope it gates, so a read of a document's _operations_ fetches the whole document; otherwise a subject who can read a scope's state could not read its operations. And a subscription's update callback fires on a later turn, as its create callback already did.

   A stream this replica does not hold has to reach the model builder as an absence, or the whole read fails where it should have failed closed on one group. The read side reports absence as an untyped error, so the absence is confirmed rather than matched on a message: a transient failure must surface rather than silently deny.

2. **Serve policy-named groups to the policy's audience.** A group document named by a grant is served to any subject the naming document's policy serves, regardless of the group's own read grants. `getGroupReferencers` on the operation index is the lookup. The four rules that bound it — the membership scope only, domain scopes only, one level, and a hundred referencers — are stated under Reads.

3. ~~**Skip denied operations in `replayDocument`.**~~ Shipped with stage 4. Both `replayDocument` and `replayDocumentVersioned` skip a denied operation. One half was missing: they appended it without advancing the scope's revision, because the header is advanced on the applied path alone, so a history whose last operation in a scope was denied replayed one revision short of what the reactor stamps. Matching state and a revision one short is still not the document the server holds, so the exit test asserts both.

4. ~~**Serve deletion-boundary state.**~~ Shipped with stage 4, gated on `documentDecisions`. One defect remained: the read model keyed its deletion branch on the action type alone, so a `DELETE_DOCUMENT` stored denied still marked every snapshot row deleted and destroyed the document's slug mappings, with nothing in any path to put either back. Reachable on the replay path, where a refused delete is written rather than thrown. A listing still omits a deleted document (see Reads).

5. **Close the versioned-documents gap in the positional walk.** `foldEvaluatedScope` (stage 6) resolves one reducer version for the entire walk, and the direction of the error is the opposite of what this step first claimed. The walk reads its base state positionally, below every upgrade boundary, and the cache deliberately withholds version-changing upgrades from a positional read — so the base carries the document's _creation-time_ version, the migration never runs during the walk at all, and the range folds with the **pre**-upgrade reducer against un-migrated state. A condition reading a field a migration introduced reads undefined for the whole history.

   That is worse than one stale answer, because admission and replay disagree. Admission reads the condition's state at the head, where every upgrade has been applied, while re-evaluation walks from below them. An operation admitted against post-upgrade state can therefore be refused when a later arrival makes the walk visit it again, retracting a tail for no reason.

   **Resolved as a documented limitation rather than an upgrade-aware walk.** Making the walk upgrade-aware means growing the fold's signature with a version context and first extracting the write cache's twice-duplicated boundary segmentation into something shared — a refactor of the hottest rebuild path, which does not belong inside the read-path stage, and which two implementations of the boundary rule would drift apart on. So `preflight:auth` reports the documents that cross a reducer version alongside the streams it already checks, and **`authConditions` must not be enabled on a fleet the sweep reports**. Creation-time upgrades from version zero are not boundaries: `reactor.create` submits one in the create batch and the rebuild applies it inline, so the sweep uses the write cache's own predicate to tell them apart.

Exit tests, all met: the worked toll statement's read grants hold — the RTO's `match` grant serves them their own statement and nobody else's, and a group-gated read grant follows a membership change with the gated document's policy revision unchanged across the whole test; a client replaying exported history containing a denied operation reproduces the state _and the revision_ the server holds; and a deleted document reads as the state at its deletion boundary rather than vanishing, while staying out of a listing.

**Stage 8: the serving path (`authEnforcement`).** Sync serving evaluates the policy. `pollSyncEnvelopes` withholds scopes the polling subject may not read, instead of asking the host's permission tables which whole documents to drop.

The protocol already withholds scopes: a remote's filter names the scopes it replicates, and the outbox is built to it, so a peer routinely holds a scope-subset of a document. This stage adds a second, per-poll predicate over the same shape. It cannot reuse the remote's filter, which is declared by the client, fixed when the channel is created, and applied for every subject alike.

Three rules make that predicate safe.

**Whole runs only.** An outbox entry is one `(document, scope, branch)` run and an envelope is a contiguous slice of one entry. Withholding a whole entry is a scope the peer does not receive. Withholding part of one is silent corruption: the receiving executor renumbers arriving operations against its own head and validates no hashes, so a partial run applies as though it were complete.

**Hold, never consume.** The present filter marks a refused entry fully delivered, which the acknowledgement trim then evicts. That is irreversible — the refill cursor has already passed it, so widening a grant later never backfills it — and, because a channel has no identity, it is performed by whichever subject happened to poll. A subject that polls while logged out would permanently evict operations its logged-in identity was entitled to. A held entry costs memory instead, and holding is what makes two bounds load-bearing rather than incidental. The persisted outbox cursor never advances past the lowest entry the remote has not been served, or a restart would rebuild the outbox from beyond a held entry and lose it as surely as consuming it would. And a remote's outbox is capped: past the cap the newest entries are evicted rather than the oldest — which keeps what remains a contiguous run from the cursor — without being marked delivered, so the cursor stays behind them and the next refill derives them again from the operation index.

**The metadata scopes are never withheld.** The `auth` and `document` scopes are what a replica folds to evaluate anything (see Reads), so withholding them would leave a peer unable to reach the decision the origin reached. This is also what keeps ordering intact: an entry that names another as its predecessor is dropped when that predecessor never arrives, and the entries that decide anything are the ones never withheld.

The verdict is intersected with the host's existing check, never unioned. Every document today carries an uninitialized policy, which allows everything, so intersecting is what makes this stage safe to ship before the migration: on an unmigrated fleet it changes nothing except withholding domain scopes on documents that actually carry a policy.

A host that closes a document by default carries that setting into the gate (see Reads), so an uninitialized policy withholds every gated scope instead of serving it. Serving is where this matters most, because it is the path that hands a whole document to another machine.

Two consequences follow from the subject being per-poll and possibly absent.

The first is that a channel belongs to a subject. It accumulates exactly what one subject is owed and carries that subject's delivery cursor, so a poll under a second address is refused rather than served from the first one's state. Which subject it belongs to is settled by adoption rather than by creation alone: a channel created by an authenticated subject is bound to that address there and then, and one created anonymously is left unbound and serves whatever the policy serves the anonymous subject, until the first authenticated poll or touch claims it. Thereafter a poll under any other address, or an anonymous one, is refused with the shape a read denial takes, so the puller re-authenticates rather than treating it as a transport failure. Adoption is only safe because entries are held and not consumed: everything an unbound channel withheld while it was serving anonymously is still queued when the adopter takes it. The exposure that buys is bounded and accepted — the first authenticated subject to reach an unbound channel owns it — because channel ids are client-generated UUIDs and the coarse drive check still gates the poll.

The second is that an anonymous poll is a subject with no address, which a policy may legitimately serve — so the coarse drive-level check that stops it today stays until the migration is done.

Exit test: a document whose policy grants a peer `read` on one domain scope and not another syncs to that peer. The peer converges on the granted scope, holds the `auth` and `document` scopes intact, receives nothing of the withheld scope, and raises no dead letter. The grant is then widened with no other change, and on the next poll the withheld operations arrive and the peer converges on the origin's state and revision — which is the test that the entries were held and not consumed. A poll under a second address on the same channel id is refused, and an unbound channel is claimed by the first authenticated poll. And on a host that closes by default, a poll for a document with no policy at all serves its `auth` and `document` scopes and no domain scope, where the same poll on a host that opens by default serves everything.

**Stage 9: migrating the permission tables (no flag).** The host's permission tables are the fleet's live access control, and the auth scope is empty on every document that exists: nothing in production has ever emitted `INITIALIZE_AUTH`. Enforcement therefore cannot be turned on until the tables are expressed as grants, and the two systems disagree in the direction that matters. They agree that an unprotected document is open. They disagree about a protected one, which is closed today and, under a policy that was never initialized, open to everyone.

A migration reads the tables and submits a genesis per document. It cannot write rows: grants are event-sourced, so installing one means an operation through the executor.

```
INITIALIZE_AUTH per document, one ordered grant list:

  1. READ  rows      -> allow {address}      read     "*"
  2. WRITE rows      -> allow {address}      read     "*"
                     -> allow {address}      execute  "*"
  3. restricted ops  -> deny  {anyone}       execute  {scope, operation: [OP]}
                     -> allow {address}      execute  {scope, operation: [OP]}
                        for each address the restriction names
  4.                 -> deny  {anyone}       execute  "auth"
  5. owner,          -> allow {address}      read     "*"
     ADMIN rows      -> allow {address}      execute  "*"
```

The order carries the whole translation, and every step exists to claw something back that the step before it granted too widely.

An `execute` capability that omits its scope covers `auth`, so a `WRITE` row written as a bare execute grant would hand policy administration to everyone the table names, permanently and replicated. Step four takes it back and step five returns it to the owner and the administrators alone — which is what `WRITE` meant. A per-operation restriction works the same way one level down: the table restricts an operation by holding a row for it at all, so step three denies it to everyone and re-allows only the addresses the restriction names. Step five passes over both, which is the table's rule that an owner and an administrator are not subject to either.

Reclaiming by order rather than by enumerating the domain scopes matters beyond tidiness. An enumerated list is correct for the scopes a document has on the day it migrates and silently fails to cover one added afterwards, which turns a write nobody authorized into a write nobody can make.

No document has a signed header, so a genesis binds no creator whoever signs it, and the creator carve-out that keeps administration reachable does not exist for any migrated document. Every migrated policy must therefore carry an explicit `execute`-on-`auth` grant or the genesis is rejected as born locked out. The owner supplies that address. A document with no owner has nobody the tables name as its administrator, and the migration refuses it and reports it rather than choosing one: inventing an administrator is granting permanent control of a document to an address its access list never mentioned.

What has no faithful translation is refused and reported, never approximated, because every approximation changes live access silently:

- Protection inherited from an ancestor. Grants do not inherit, so the closure has to be materialized onto every descendant, and a document added to that drive afterwards inherits nothing.
- A document whose principals exceed the version-1 cap of 100 grants.
- Node-local administrators. These are not refused, they are dropped, because there is nothing to translate: the reactor has no such concept and never had one. The only carve-out in `decide` is the per-document creator, deliberately, since a node-local list cannot be verified by a replica and an operation one admitted would replay as refused everywhere else. An administrator who could read past a document's policy at the host while the reactor denies the same read is an inconsistency, not a feature, so the migration does not preserve it.
- Nothing, in the case of a host that protects by default. A document with no rows there is closed, and the faithful per-document translation would be a genesis on every document in the store — one that names an administrator none of them has, so most would be refused as born locked out anyway. The host default covers these instead (see Reads), and the migration writes nothing for them, exactly as it writes nothing for an unrowed document on a host that opens by default. What the migration covers on either kind of host is the same thing: the documents the tables actually name.

Migrating publishes every access list, and that is accepted rather than mitigated. The auth scope is readable by every holder of a document, so a grant naming an address tells every replica who that address is, where the tables are private to one host today. It is the same posture the spec already takes for a group's roster: state a replica must fold to evaluate a policy cannot be withheld from it without breaking convergence. A document whose access list must stay confidential cannot have a replicated policy at all.

The migration runs on one replica with auth writes quiesced, because two writers produce tied timestamps on a stream the monotonic rule refuses to replicate and that is never reshuffled — an unrepairable state. It is idempotent by skipping any document whose auth scope is already initialized, and it writes nothing for a document with no rows — whose empty policy is the correct translation of "unprotected" on a host that opens by default, and is covered by the host default on one that closes.

Exit test: against a store carrying each construct — a protected drive with an inherited grant, a protected document with an owner, an unprotected document, a restricted operation, and one document past the grant cap — a dry run reports exactly what it cannot express and writes nothing. A real run then produces, for every migrated document, a policy under which the read gate and the permission tables return the same answer for every subject, scope and operation in the fixture — with one deliberate exception, a node administrator, who the tables answer for and the policy does not. The over-cap document is untouched and reported, a second run writes no operation, and `preflight:auth` reports the fleet clean.

**Stage 10: retiring the permission tables (`authEnforcement`).** The host stops consulting its tables on the read path: the subgraph read helpers, the per-item list filters, the subscription predicates, the attachment gate, and the intersection stage 8 introduced. The auth scope becomes the only read authorization.

What does not go is the host's own default. Retiring the tables retires a per-document access list, not the answer a host gives for a document no list mentions, and on a host that closes by default that answer is the only thing holding most of its documents shut. It survives as one setting on the read surface (see Reads) rather than as a table, and it is the reason this stage does not require every document to be migrated first.

Turning this on for a fleet that never migrated, and that opens by default, makes every document readable by anyone, silently — every policy is uninitialized, so the gate allows everything. That is the one failure this stage must make impossible, so it is a boot assertion rather than a note: a reactor refuses to start with `authEnforcement` on when the tables hold rows the migration has not translated, unless the host closes by default, where an untranslated row narrows access rather than widening it.

The write door needs the same treatment and does not get it from the read gate. A host that protects by default refuses writes to an unrowed document too, through the same tables, and the auth scope would allow them. So the check on the receiving door — the one that authorizes an operation arriving over the API before it is submitted — keeps the host default as well. That check is a local refusal: it stops an operation from being submitted, and it never writes a refusal into any document's history. It must stay that way. A host default that reached the replay evaluation would record a `denied` outcome that a host without the setting never records, and two replicas would hold different state — which is the whole reason enforcement flags flip per fleet rather than per node.

Two things do not port and need their own answer rather than a translation.

Listings keep dropping whole documents. The gate withholds scopes and always serves the header, so a listing that only filtered scopes would leave every id, slug, name and access list enumerable by anyone who can reach the endpoint. A listing therefore synthesizes a document-level verdict from the gate — readable if any gated scope is — and omits the rest, which is what it does today and what the read surface already does for a deleted document.

The surfaces that never consulted the tables at all — drive node trees, analytics, package listings, the MCP endpoint — are neither made safe by this stage nor made less safe by it. Each is its own read surface to gate, and saying so here is not a plan to do it.

Administration of the node survives this stage; administration of a document does not. Installing a package or reaching the MCP endpoint is not a read of any document and no policy governs it, so the operator check stays where it is. What goes is the shortcut that let that same check skip a document's read filter.

Exit test: the existing read-denial suites pass with `authEnforcement` on against the migrated fixture, with their assertions restated from which check was called to what the caller received. And a reactor booting with the flag on, against a store holding unmigrated rows, fails to boot rather than serving.

Registering decision models beyond auth is out of scope. The types are model-agnostic, so that work is registration, not new semantics.

### Stage 4 in steps

1. **Declare the flag.** `authEnforcement`, requiring `documentDecisions`. The prerequisite table is exhaustive over the flag type, so this is a type error until declared.

2. **Add the auth projection.** A second projection on the document decision model, querying the `auth` scope, declaring the four auth actions as its deciding actions, and applying them with `applyAuthAction`. Nothing in the walk or the model assembly changes: a model already carries one value per projection, named by the projection.

3. **Expand `decide`.** The uninitialized, creator, version, and grant steps already exist as `decide` in `shared/document-model`. This step calls them from the model's `decide` and returns the refusal each one implies, so an operation records why it was refused rather than a single reason for every refusal.

4. **Enforce the monotonic-timestamp rule.** An auth operation entering the stream is rejected unless its timestamp is strictly greater than the newest already there, whether it was written locally or arrived by sync. The rejection is an exception rather than a refused operation, so the stream holds no ties and no arbitrary tie-break decides authority. The auth stream is therefore never reshuffled, and the write path rejects a backdated auth write rather than repositioning it.

   A rejected arrival is a permanent failure for that sync operation, so it dead-letters under a new `SyncOperationErrorType`, keeping its operations for application-specific handling. This is the answer for two replicas that each accepted an auth operation offline: no ordering rule can reconcile them, because either order hands one replica authority the other never granted, so the reactor holds them rather than choosing.

   A re-append is not an arrival. Re-evaluation keeps an operation's timestamp when it moves it to a new index, so the rule does not apply and a refusal from another scope can still retract the tail it invalidated.

5. **Retire the interim gates.** The admission gate reaches a real policy only for an `auth`-scope operation (see stage 1), so removing it transfers live behavior for that scope and no behavior for the others. The auth projection covers both once step 3 lands.

6. **Exempt re-evaluation from the excessive-shuffle guard.** A revocation over a long history legitimately supersedes many operations, and counting those re-appends would dead-letter the pass on exactly the busy documents that most need it. The pass itself is already exempt, because it re-appends outside the load path where the guard lives. What the guard has to stop counting is the _next_ backdated arrival reaching into a range a pass already re-appended: a re-append is a second copy of an action the stream already holds, so it is not work that arrival is doing for the first time.

7. **Order the auth stream against the domain streams it decides.** An auth operation already in a document's stream decides the domain operations that sort after it, because the auth scope is a read-set stream. A load job carries one scope, so an envelope holding both becomes two jobs whose enqueue order is not guaranteed; when the domain job runs first it is admitted against the older policy and the auth arrival owes the re-evaluation pass that corrects it. Convergence holds either way, at the cost of a pass and a re-append.

8. **Filter reads and sync against the same model.** Stage 3's two read-side limits closed here: `replayDocument` applying denied operations, and reads hiding a deleted document rather than serving the state at the deletion boundary. Routing the read _filter_ through the model did not ship here; that is stage 7, which also cleared the defects left in these two.

9. **Degrade against a remote that predates the schema.** `deniedReason` and `errorType` are new fields on the sync schema, and GraphQL rejects a whole query for naming a field the schema does not have. A reactor at this stage polling a remote that has not upgraded would therefore fail every poll, and the failure classifies as unrecoverable, so the channel's polling stops until the process restarts. That is a sync outage caused by an upgrade, in a direction operators cannot always control: browser clients update on their own schedule, not the fleet's.

   `GqlRequestChannel` selects the two fields only while the remote is known to serve them. A remote that rejects them once is polled without them for the rest of the channel's life, which loses nothing real, because a remote on the previous schema has neither a denied operation nor an `errorType` to report. The push direction is already safe: `serializeEnvelope` omits `deniedReason` when it is undefined.

   The reactor-browser pull path (`GetDocumentOperations`) selects `deniedReason` from a static document and does not degrade, so that client still requires its server to be upgraded first.

10. **Check the fleet before enabling the flag.** The monotonic rule refuses to replicate an auth stream holding a tie, and the walk cannot read one stored out of timestamp order at all. Neither is repairable after the fact, because the auth stream is never reshuffled, so a fleet is checked before `authEnforcement` is turned on rather than after:

    ```
    pnpm preflight:auth --pg <connection-string>     # or --pglite <data-directory>
    ```

    It reports each unsafe stream and exits non-zero, so it can gate a rollout. The target is required: the tool reads a fleet's own store, and a run that quietly opened an empty database would report every fleet as safe, which is the one answer it must never give by accident.

    The same tool reports the documents that cross a reducer version, which gate `authConditions` rather than `authEnforcement` (see stage 7, step 5). The two are reported separately, because a fleet can be safe for one and not the other.

### Ordering rules the write paths keep

Four rules hold as of stage 3, and stage 4 depends on all of them. Each was broken when the stage began.

An evaluation pass is owed by comparing a committed operation against the largest timestamp in the streams that read it, which is what the store reports as `latestTimestamp`. The last-indexed operation is not that timestamp, because a reshuffle can leave a later one behind it at a lower index.

A write is positioned by its timestamp on both paths, once `documentDecisions` is on. The caller supplies the timestamp, so a write can belong before operations already stored, and it is reshuffled into place rather than appended at the tail. Otherwise the scope is left out of timestamp order and no forward walk over it is correct.

Creation does not move. `reactor.create` submits `CREATE_DOCUMENT` and its `UPGRADE_DOCUMENT` from version zero as one batch, and that pair holds the first two indexes for the life of the document, so no reshuffle includes it however far back the conflicting range reaches.

Every re-appended operation carries the skip the reshuffle assigned it, so the operations it replaces stop counting. This reaches the relationship actions and `DELETE_DOCUMENT` through their own handlers.

## Worked example: a revocation race

A document grants the legal-assistant group `execute` on the global scope. Reactor A and reactor B both hold the document and are offline from each other.

1. On reactor A, the administrator executes `REMOVE_GRANT` for the group at 10:00.
2. On reactor B, a legal assistant executes `SET_STATUS` at 10:05. B's admission gate allows it because B has not seen the revocation.
3. The reactors sync.

Both replicas now merge the streams and re-evaluate. The revocation sorts first (10:00 < 10:05). At `SET_STATUS`'s position, the grant list no longer contains the group grant, so the decision is deny. `SET_STATUS` becomes an error operation on both replicas, including B, which originally accepted it. The operation stays in the log and has no state effect. The assistant's client sees its provisional operation fail after sync, in the same way any local-first write can fail when a conflicting change arrives.

The alternative would be to evaluate an operation once at its origin and pin that decision forever. That would let `SET_STATUS` survive everywhere despite the earlier revocation. Both outcomes are deterministic, but this spec deliberately chooses to bubble up the error and let the application decide.

## Worked example: a toll statement

This is a TRP toll statement. The operation names are illustrative — the model is not built yet — but the shape is real. Keep one line clear: which status transitions are legal is the reducer's job (a domain invariant); who may act, and when, is the policy's job. Statements are created by the ingest service, so that service's key is each statement's governance root, and the human administrator gets in through the first grant below. Legal assistants are a `PHGroup` rather than a list of addresses, so hiring or offboarding one is a single membership operation on that group — every statement picks it up at its next decision, with no per-statement writes.

```json
{
  "version": 1,
  "grants": [
    // the site administrator governs the policy and can act anywhere. No
    // companion read grant: an allow on execute carries the read with it, so
    // this one grant already serves every scope to that address.
    {
      "id": "g-admin",
      "description": "Site administrator: full governance",
      "effect": "allow",
      "principal": { "address": "0x…site-admin" },
      "capability": { "can": "execute", "scope": "*" }
    },

    // the RTO reads their own statement
    {
      "id": "g-rto-read",
      "description": "RTO reads their own statement",
      "effect": "allow",
      "principal": {
        "match": {
          "eq": [
            { "attr": "subject.address" },
            { "attr": "doc.global.rtoAddress" }
          ]
        }
      },
      "capability": { "can": "read", "scope": "global" }
    },

    // the RTO may re-upload, but only after a failed extraction
    {
      "id": "g-rto-reupload",
      "description": "RTO re-uploads after a failed extraction",
      "effect": "allow",
      "principal": {
        "match": {
          "eq": [
            { "attr": "subject.address" },
            { "attr": "doc.global.rtoAddress" }
          ]
        }
      },
      "capability": {
        "can": "execute",
        "scope": "global",
        "operation": ["REPLACE_STATEMENT_PDF"]
      },
      "where": {
        "eq": [{ "attr": "doc.global.status" }, { "lit": "PROCESSING_ERROR" }]
      }
    },

    // the ingest service reads every statement and writes extraction results while it is processing
    {
      "id": "g-sys-read",
      "description": "Ingest service reads every statement",
      "effect": "allow",
      "principal": { "address": "0x…ingest-service" },
      "capability": { "can": "read", "scope": "global" }
    },
    {
      "id": "g-sys-ingest",
      "description": "Ingest service writes during processing",
      "effect": "allow",
      "principal": { "address": "0x…ingest-service" },
      "capability": {
        "can": "execute",
        "scope": "global",
        "operation": ["SET_EXTRACTED_FIELDS", "SET_STATUS"]
      },
      "where": {
        "in": [
          { "attr": "doc.global.status" },
          [{ "lit": "PROCESSING" }, { "lit": "PROCESSING_ERROR" }]
        ]
      }
    },

    // legal assistants read every statement and drive review while it is not terminal
    {
      "id": "g-las-read",
      "description": "Legal assistants read every statement",
      "effect": "allow",
      "principal": { "group": "phd…las-staff-group" },
      "capability": { "can": "read", "scope": "global" }
    },
    {
      "id": "g-las-review",
      "description": "Legal assistants review before terminal",
      "effect": "allow",
      "principal": { "group": "phd…las-staff-group" },
      "capability": {
        "can": "execute",
        "scope": "global",
        "operation": [
          "SET_STATUS",
          "SET_LINE_ITEM_DECISION",
          "VALIDATE_EXTRACTION"
        ]
      },
      "where": {
        "notIn": [
          { "attr": "doc.global.status" },
          [
            { "lit": "APPROVED" },
            { "lit": "REJECTED" },
            { "lit": "NOT_PURSUED" }
          ]
        ]
      }
    },

    // once terminal, content edits are frozen for everyone; this sits last, so it overrides the allows above
    {
      "id": "g-terminal-freeze",
      "description": "Freeze content edits once terminal",
      "effect": "deny",
      "principal": { "anyone": true },
      "capability": {
        "can": "execute",
        "scope": "global",
        "operation": [
          "SET_EXTRACTED_FIELDS",
          "REPLACE_STATEMENT_PDF",
          "SET_LINE_ITEM_DECISION"
        ]
      },
      "where": {
        "in": [
          { "attr": "doc.global.status" },
          [
            { "lit": "APPROVED" },
            { "lit": "REJECTED" },
            { "lit": "NOT_PURSUED" }
          ]
        ]
      }
    }
  ]
}
```

1. A legal assistant sets the status to APPROVED. From that operation on, `g-las-review` stops applying (its `where` is now false) and `g-terminal-freeze` applies, so the next attempt to edit line items or replace the PDF is denied at admission — and, if it arrives via sync anyway, is denied at its position and recorded as an error operation.
2. To amend an approved statement, the administrator sets the status back to a working value: `g-terminal-freeze` does not list `SET_STATUS`, so it does not block the reopen, and `g-admin` allows it.

Reads run on the same grants — the RTO sees their own statement; the legal-assistant group, the ingest service, and the admin see every statement; and nobody else reads anything.
