# Review: PR #2900 (auth v4, `authEnforcement`)

Review of PR #2900 as of head `3e1325ba1` — 106 files, +13713/−3394. Line
numbers are as of that commit and will drift; each item names the symbol so it
stays findable.

This is a second pass over the same work reviewed in
`auth-v4-stage4-review.md`. Everything that review raised has been applied, and
those fixes were re-checked here rather than re-reported. The findings below are
new, except where a heading says otherwise.

## Verification run

Findings were first raised against head `13a32f911` and re-checked against
`3e1325ba1`. Four commits landed in between: `3a1eb377c` (lint-staged hook),
`248692e06` (recipes runner), `cb2045ed5` (formatting sweep), and `3e1325ba1`
(the `denied.ts` extraction). Every line number cited below was re-verified
against the new head, and every finding except the formatting one still stands —
the diff of `packages/reactor/src/sync/`, `packages/reactor-api/src/graphql/`
and `packages/reactor-browser/src/graphql-client/` between the two heads is
**empty**.

| Check                                                                                                                                                  | Result                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `packages/shared` — `pnpm build` (dist)                                                                                                                | clean                                                                      |
| `packages/shared` — `pnpm tsc --build`                                                                                                                 | clean                                                                      |
| `packages/reactor` — `pnpm tsc --build`                                                                                                                | clean                                                                      |
| `packages/reactor-api`, `packages/reactor-browser` — `pnpm tsc --build`                                                                                | clean                                                                      |
| `packages/reactor` — `pnpm vitest run test/decision test/executor test/sync test/storage test/core test/client test/admin test/read-models test/cache` | 105 files, 1853 tests pass                                                 |
| `packages/document-model` — `pnpm vitest run` (auth-actions, auth-decide, auth-validation, replay, auth-persistence)                                   | 5 files, 91 tests pass                                                     |
| `packages/reactor-browser` — `pnpm vitest --run --project browser test/remote-controller/utils.test.ts`                                                | 1 file, 28 tests pass (verified running in chromium, not silently skipped) |
| CI `check` job                                                                                                                                         | **passes** as of `cb2045ed5` (was 34 `prettier/prettier` errors)           |
| CI `Test Reactor`, `do-codegen-tests`, E2E suites                                                                                                      | pass at `3e1325ba1`                                                        |

Finding 1 was reproduced by execution against this checkout; the probe appears
in that finding and is the shape the missing regression test should take.

The formatting failure this review originally listed as a merge blocker is
**resolved**. `cb2045ed5` swept the whole branch diff rather than only the two
files CI happened to report, and `check` is green.

## Status of the merge blockers

All four are now fixed, in the order this review proposed. Each commit carries
its own verification; the findings below are kept as written, with a status line
at the top, because the reasoning is what makes the fix reviewable.

| Finding                                                 | Status    | Commit      |
| ------------------------------------------------------- | --------- | ----------- |
| 1 — retention is a reachability rule                    | **fixed** | `3db42daac` |
| 5 — a snapshot is not a door onto the policy            | **fixed** | `f947e562e` |
| 4 — poll query degrades against an older remote         | **fixed** | `0c3aefe65` |
| 7 — `initialState` filtered, `subscribe()` keeps `auth` | **fixed** | `77fee70b4` |

Two of the fixes came out differently than proposed, both because the proposal
was not strong enough:

- Finding 5's both-initialized case was going to reuse
  `assertAuthPreservedOnDuplicate`'s version-and-creator comparison. That admits
  a full grant-list swap, since two unrelated policies are both version 1 with
  no creator; the test caught it. It compares the whole policy now.
- Finding 4 was going to be a deployment-order note. Server-first is not
  arrangeable for browser clients, and an older remote has neither a denied
  operation nor an `errorType` to report, so the channel degrades instead:
  correct rather than merely tolerable. The note survives for the
  reactor-browser pull path, which still selects the field statically.

Findings 2, 3, 6 and 8 through 11 remain open, and remain the work to do before
either flag is enabled.

## Does anything block merging with all flags off?

Both flags default off everywhere (`?? false` in the executor constructor and
the builder), and switchboard enables them only through `REACTOR_DOCUMENT_DECISIONS`
and `REACTOR_AUTH_ENFORCEMENT`. So the question is worth answering precisely.

**Originally yes — three things, all reachable with the flags off. All three are
now fixed** (findings 1, 4 and 5, plus 7 as a narrower case), so nothing in this
review blocks a flags-off merge as of `77fee70b4`. The analysis below is kept
because it is what decides whether a _future_ finding blocks: the reachability
argument, not the flag's default.

The trap is that two enforcement surfaces in this design run **regardless of the
flags**:

- **The interim gate** (`simple-job-executor.ts:574`) is active precisely when
  `authEnforcement` is _off_, and it calls `decide(document.state.auth, …)` on
  real policy state for every non-replayed regular action in every scope. A
  policy that exists is therefore live with the flags off.
- **The client read gate** (`client/util.ts:38`, `canReadScope` /
  `filterReadableScopes`) is a plain function on the read path with no flag
  check at all.

Anything that writes or corrupts `state.auth` is consequently in scope with the
flags off, because the reducers that write it are never flag-gated either.

| #       | Blocked flags-off merge? | Item                                                                                      |
| ------- | ------------------------ | ----------------------------------------------------------------------------------------- |
| 4       | yes — **fixed**          | New reactor polling an older server loses sync entirely; query text is static             |
| 1       | yes — **fixed**          | Shadowed-admin lockout is accepted by validation, and the interim gate makes it bite      |
| 5       | yes — **fixed**          | `UPGRADE_DOCUMENT` installs an unvalidated policy; escalation via self-assigned `creator` |
| 7       | narrower — **fixed**     | `initialState` leaks unreadable scopes; `subscribe()` skips `withAuthScope`               |
| 11      | unlikely                 | Pre-rule auth history replays three different ways (needs history nothing emits today)    |
| 2, 3    | no                       | Held-auth dead-letter classification requires `authEnforcement` to produce the error      |
| 6, 8, 9 | no                       | Gated behind `documentDecisions` and/or `authEnforcement`                                 |
| 10      | no                       | Operator tool, only relevant to turning the flags on                                      |

Findings 6, 8 and 9 are genuinely unreachable with the flags off, and I verified
the gates rather than assuming them: `refuseIfPolicyDenies` returns at its flag
check, `positionByTimestamp` returns `plain()`, `servesDeletionBoundary` is
`documentDecisions` (`reactor-builder.ts:622`), and both executor paths reject
work for a deleted document outright when `documentDecisions` is off
(`simple-job-executor.ts:528`, `:1250`) — so the slug-mapping resurrection in
finding 9 has no trigger.

**The minimum to merge behind flags** was findings 4, 1 and 5, with 7 as a
narrower case. All four have landed. Findings 2, 3, 6, and 8 through 11 are still
open and must go in before either flag is enabled, not after: 2 and 3 in
particular are the difference between the monotonic rule being survivable and
quarantining every affected document.

## What the change does

The auth stream becomes a second projection in the decision model, so a write is
decided against the policy as it stood _at that write's position_ rather than at
the stream head.

- `decision/auth-decision-model.ts` — the auth projection, mapping an
  `AuthRefusal` onto one of the persisted reason strings in
  `shared/document-model/denied.ts` (extracted from `operations.ts` in
  `3e1325ba1` to break a runtime import cycle; `isDenied` moved with them).
- `decision/registered-model.ts` — `selectDecisionModel` picks document-only vs
  document+auth from the flags, so a stream a flag has not enabled is never read.
- `decision/walk.ts` — `walkByPosition` is a two-way generator, so a denial this
  pass produces suppresses its operation the way a stored one does.
- Monotonic auth stream — an auth write must strictly exceed the stream's maximum
  timestamp, the stream is never reshuffled, and violations are terminal,
  dead-lettered, and deliberately non-quarantining.
- Dead-letter classification (`errorType`) persisted via migration 016, carried
  over GraphQL, and mirrored by peers.
- `ExcessiveReshuffleError` discounts re-appended actions, so revocation over a
  long history is not self-blocking.
- Read side: denied operations no longer apply on replay, a deleted document
  serves boundary state by id but never by slug, and `subscribe()` filters
  readable scopes.

The parts reviewers probed hardest came back clean: terminal-versus-retryable
classification across every new error path, the equal-timestamp pre-flight and
its agreement with the integrity service and the sweep, reshuffle-guard
discounting at exactly the threshold, flag gating being byte-for-byte the old
behavior with both flags off, reason plumbing through all three consumers, and
the auth-stream TOCTOU (append condition plus `unique_revision` plus the
retry re-running the pre-flight). Migration 016 is additive with a default and
coalesced on read. The generated GraphQL files look genuinely codegen-produced.

---

## Finding 1 — auth-administration retention is bypassable by shadowing

**Fixed** — commit `3db42daac`. `administrationReachable` asks `evaluateGrantStack` instead of pattern-matching a grant; retention now also covers appends and `MOVE_GRANT`; the three fixtures that depended on the accepted-but-locked-out policies were reordered or narrowed to keep their subject; the two error messages now describe reachability. Both error strings changed, which is history-visible, and the rule is unshipped so that was the same call already made for the rule itself.

**Severity: critical.** `packages/shared/document-model/auth-v1.ts:429`
(`isAuthAdministrationGrant`), used from `assertValidInitialGrants` (`:383`) and
`assertAuthAdministrationRetained` (`:454`). Reachable with the flags off.

### Symptom

The rule tests whether an administration-shaped grant **exists** in the list. V1
evaluation is last-applicable-grant-wins (`evaluateGrantStack`), so any later
`deny` covering `execute` on `auth` shadows that grant while leaving it present.
Validation sees an admin grant and accepts; evaluation denies everyone.

Verified by execution against this checkout, probing
`evaluate(auth, subject, {execute, auth, SET_GRANT})` afterwards:

| Sequence on a creator-less policy           | Validation                                  | Administrable after?           |
| ------------------------------------------- | ------------------------------------------- | ------------------------------ |
| Genesis `[admin, deny anyone execute auth]` | **accepted**                                | **denied** (`denied-by-grant`) |
| Append that deny onto `[admin]`             | **accepted**                                | **denied** (`denied-by-grant`) |
| In-place downgrade of `g-admin` (control)   | rejected (`AuthAdministrationLockoutError`) | —                              |
| `[admin]` alone (control)                   | accepted                                    | administrable                  |

So the rule catches "remove or downgrade the grant by id" and misses "shadow it
with a trailing deny", which produces the identical permanent lockout the rule
exists to prevent. The comment at `auth-v1.ts:388-392` — "an append can only add
a grant, so it can never take the last administration grant away" — is false as
written: an append cannot remove a grant, but it can render every grant
inapplicable.

`MOVE_GRANT` (`auth.ts:328`) is the same hole without even the existence check.
It mutates grant _order_, which is the only thing that decides which grant wins,
and performs no retention check at all. Given the administrable policy
`[g-freeze (deny anyone execute *), g-admin (allow anyone execute auth)]`, a
holder of `g-admin` submitting `MOVE_GRANT {id: "g-admin", index: 0}` is
authorized at that moment, accepted by the reducer, and locked out immediately
after.

### Blast radius

The fixture this PR added at
`packages/reactor/test/decision/auth-projection.test.ts:524-535` is exactly
vector 1 — `[AUTH_ADMIN_GRANT, g-lockdown (deny anyone execute *)]` — with a
comment asserting the admin grant makes it acceptable. That policy is born
locked out. The test passes only because `authEnforcement` is off for that case.

With the flags off the lockout still bites, through the interim gate: `decide`
returns deny for every auth-scope action, so `SET_GRANT`, `REMOVE_GRANT` and
`MOVE_GRANT` all fail with `AuthorizationDeniedError` and there is no creator
carve-out to fall back on. There is no recovery path on any replica.

### Proposed implementation

Replace the existence test with a reachability probe against the candidate list.
The evaluator is already the authority, so use it rather than re-deriving its
rules:

```ts
/** Whether some subject can still administer the auth scope under this list. */
function administrationReachable(grants: Grant[]): boolean {
  const candidates = grants.filter(
    (grant) =>
      grant.effect === "allow" &&
      grant.where === undefined &&
      ("anyone" in grant.principal || "address" in grant.principal) &&
      capabilityCovers(grant.capability, AUTH_ADMINISTRATION_REQUEST),
  );

  return candidates.some((grant) => {
    const subject =
      "address" in grant.principal
        ? { address: grant.principal.address, key: undefined }
        : { address: undefined, key: undefined };
    const outcome = evaluateGrantStack(
      grants,
      subject,
      AUTH_ADMINISTRATION_REQUEST,
    );
    return outcome.decision === "allow";
  });
}
```

Then `assertValidInitialGrants` and `assertAuthAdministrationRetained` both call
`administrationReachable` in place of `grants.some(isAuthAdministrationGrant)`,
and `applyMoveGrantAction` gains the same retention assertion the other two
mutation paths carry, comparing the pre-move and post-move lists.

Fix the fixture at `auth-projection.test.ts:524` in the same change, and add the
assertion whose absence hid this: after every _accepted_ mutation in the
retention block of `auth-actions.test.ts`, assert that some subject still
evaluates `allow` for `execute`/`auth`/`SET_GRANT`.

---

## Finding 2 — held auth dead letters quarantine the document anyway

**Severity: critical**, but only with `authEnforcement` on.
`packages/reactor/src/sync/sync-manager.ts:766-769` and `:881-884`.

### Symptom

When an inbound load job fails, the sync manager wraps the message and nothing
else:

```ts
const error = new ChannelError(
  ChannelErrorSource.Inbox,
  new Error(`Failed to apply operations: ${errorMessage}`),
);
```

`syncOperationErrorType` (`sync/utils.ts:563`) then derives
`classifyJobFailure("Error")`, which is `UNCLASSIFIED`, which quarantines
(`:567`, `:577`). The typed name is structurally unavailable at that site:
`toErrorInfo` (`executor/job-result-handler.ts:38-49`) reduces the error to
`{message, stack}`, and `ErrorInfo` (`shared/types.ts:12-15`) has no `name`
field, so the awaited `JobInfo` cannot carry it.

The comment two lines above the classification call
(`sync-manager.ts:501-502`) states the invariant this breaks: a held auth
operation must keep syncing, because reconciling the two policies needs the
traffic a quarantine stops.

### Blast radius

Replica R pulls auth operations from peer P that violate R's auth head. The
executor fails the job with `AuthTimestampNotMonotonicError`, the wrap loses the
name, and R quarantines the document — which stops it syncing in **both**
directions (`sync-manager.ts:653-655` inbox filter, `:986` outbox filter), with
nothing that clears a quarantine. The row persists as `UNCLASSIFIED`, so restart
keeps the quarantine, and peers polling R mirror `UNCLASSIFIED`
(`reactor-api/.../resolvers.ts:1106`) and quarantine too. The deliberate
"hold them rather than choosing" design is inert in production.

Every passing test hand-crafts `ChannelError(Inbox, typedError)`, bypassing both
real wrap sites, which is why the suite is green.

### Proposed implementation

`ErrorInfo` gains the name, since every consumer of a failed job that wants to
classify needs it:

```ts
export type ErrorInfo = {
  name: string;
  message: string;
  stack: string;
};
```

`toErrorInfo` sets `name: error instanceof Error ? error.name : "Error"`, and
both sync-manager wrap sites classify explicitly rather than relying on
`error.name` of a freshly-constructed `Error`:

```ts
const errorType = classifyJobFailure(completedJobInfo.error?.name ?? "Error");
const error = new ChannelError(
  ChannelErrorSource.Inbox,
  new Error(`Failed to apply operations: ${errorMessage}`),
  errorType,
);
```

The regression test must drive a real failed load job through executor →
`JobResultHandler` → awaiter → `applyInboxBatch` and assert the persisted
`errorType` and the absence of a quarantine — a hand-built `ChannelError` cannot
catch this.

---

## Finding 3 — dead-letter rehydration drops the persisted `errorType`

**Severity: high**, only with `authEnforcement` on.
`packages/reactor/src/sync/sync-manager.ts:588-591`.

`loadDeadLetters` rebuilds mailbox items as
`new ChannelError(record.errorSource, new Error(record.errorMessage))`, dropping
`record.errorType` — the column migration 016 exists to add.

After a restart, reactor-api serves dead letters from that in-memory mailbox and
recomputes the classification from the stripped error
(`resolvers.ts:1099-1106`), so peers are told `UNCLASSIFIED` and freeze
documents the origin is deliberately still syncing. Masked today by finding 2,
because the persisted value is already `UNCLASSIFIED`; it re-breaks the feature
independently the moment finding 2 is fixed.

**Proposed implementation:** pass the third argument.

```ts
new ChannelError(
  record.errorSource,
  new Error(record.errorMessage),
  record.errorType,
);
```

Add a restart-path test that rehydrates through `loadDeadLetters` and asserts
the classification a peer would be served.

---

## Finding 4 — the poll query breaks sync against an older server

**Fixed** — commit `0c3aefe65`. `GqlRequestChannel` selects the two fields only while the remote is known to serve them, and stops for the channel's life once a remote rejects them. The reactor-browser pull path still selects `deniedReason` statically and is documented as server-first.

**Severity: high.** Reachable with the flags off — the
query text is static.
`packages/reactor/src/sync/channels/gql-req-channel.ts:569` (`deniedReason`) and
`:615` (`errorType`); same shape in
`packages/reactor-browser/src/graphql-client/operations.ts:21`.

### Status: not fixed, and `test:integration` cannot confirm it either way

This finding was reported fixed on the strength of `test:integration` passing.
Both halves of that are worth stating plainly, because the second is the more
useful fact.

**The code has not changed.** `git diff 13a32f911..3e1325ba1` over
`packages/reactor/src/sync/`, `packages/reactor-api/src/graphql/` and
`packages/reactor-browser/src/graphql-client/` is empty, and both selections are
still unconditional in the query document at the head reviewed here.

**The integration suite cannot detect this class of defect at all.** Root
`test:integration` runs `test/test-connect` plus reactor-api's
`hub-spoke-catchup.integration.test.ts`, and that test replaces the GraphQL
transport with `createResolverBridge`
(`packages/reactor-api/test/utils/gql-resolver-bridge.ts`), which dispatches on
`body.query.includes("pollSyncEnvelopes")` and calls the resolver function
directly:

```ts
if (body.query.includes("pollSyncEnvelopes")) {
  const result = pollSyncEnvelopes(syncManager, variables);
  return createMockResponse({ pollSyncEnvelopes: ... });
}
```

There is no schema, no `graphql()` execution, and therefore no validation step
anywhere in that path — the only thing done with the query string is a substring
match. A selection set naming a field the schema does not have cannot fail here,
however wrong it is. On top of that, both sides of the bridge are built from the
same source tree, so even with validation the test would be exercising
new-client-against-new-server, which is the one combination this finding says is
fine.

So a green `test:integration` is consistent with the finding being fixed and
equally consistent with it being untouched, which is what it is. Confirming this
one needs a test that validates the query against the **previous** published
schema, or a deliberate deployment-order decision — see below.

### Symptom

Both selections are unconditional in the query document. GraphQL rejects a query
selecting an unknown field at validation, so a reactor at this commit polling a
pre-PR server gets `errors` on **every** poll. That becomes a
`GraphQLRequestError` of category `graphql` (`:1001-1006`), which `classifyError`
treats as unrecoverable (`:835-836`), and `handlePollError` stops the poll timer
and enters an error state (`:429-434`). Pull sync with that remote is dead until
the process restarts.

The push direction was deliberately made old-peer-safe in this same change:
`serializeEnvelope` omits `deniedReason` when undefined
(`sync/channels/utils.ts`), with a comment about peer-schema compatibility. The
poll direction has no equivalent, so the asymmetry reads as an oversight rather
than a decision.

### Blast radius

Any fleet that is not upgraded in lockstep, which includes Connect browser
clients pulling from remote switchboards. The reverse direction is safe — the
server's new fields are nullable, so an old client against a new server is
unaffected — so the constraint is strictly server-first, and nothing states it.

### Proposed implementation

Pick one and write it down. Either accept the constraint and document it (a note
in the PR body and the rollout section of `docs/specs/auth-scope.md` saying
servers upgrade before clients and peers), or make the selection tolerant by
probing the remote's schema once per channel and selecting the field only when
present. Documenting is cheaper and matches how the flags themselves are being
rolled out; the important thing is that it stops being implicit.

If a test is wanted rather than a note, the assertion has to involve a schema the
current code did not generate. Validating the channel's own query documents
against the previous release's `schema.graphql` — checked in as a fixture, and
run through `graphql`'s `validate` — is the cheap version, and it fails today for
the two fields above. A resolver-bridge test cannot substitute for it, for the
reason given under Status.

---

## Finding 5 — `UPGRADE_DOCUMENT` is an unvalidated door onto `state.auth`

**Fixed** — commit `f947e562e`. `resolveSnapshotAuth` resolves the scope for both doors: a snapshot with no policy or an uninitialized one leaves the standing policy alone, an uninitialized document validates before installing, and a snapshot reaching an initialized document must carry that policy exactly — compared whole, not by version and creator, which two unrelated policies both satisfy.

**Severity: high.** Reachable with the flags off.
`packages/shared/document-model/upgrades.ts` (`applyInitialState`),
`packages/shared/document-model/operations.ts` (`loadStateOperation`), applied at
`packages/reactor/src/executor/document-action-handler.ts:647`.

### Symptom

`applyAuthAction` is the only validated door onto `state.auth`. `applyInitialState`
and `loadStateOperation` replace the auth policy wholesale with no validation, so
the genesis invariant added in `13a32f911` is bypassable — including through the
path production actually uses. A creator-less, version-1, zero-grant policy is
accepted this way and is born locked out.

The handler applies the caller's `initialState` verbatim and persists it as
`resultingState`, and there is no genesis-only guard on `fromVersion: 0`
(`isGenesisOperation` is used only by the reshuffle guard). Authorization for the
action is `{verb: "execute", scope: "document", operation: "UPGRADE_DOCUMENT"}`
(`:163`), so this is also a cross-scope escalation: a subject with `execute` on
the **document** scope and no auth grant at all can replace an existing
document's policy, including naming itself `creator` — which then permanently
exempts the document from the retention rule (`auth-v1.ts:450`).

### Blast radius

The duplicate and import paths drive this call on every document
(`reactor-drive/src/client/reactor-drive-client.ts:514-520`,
`reactor/src/client/drive-client.ts:120-127`), passing `document.state` verbatim,
and `assertAuthPreservedOnDuplicate` (`auth.ts:377`) _requires_ version and
creator to be carried across, so it actively forces an unvalidated policy
through without ever checking administrability.

Related and worth deciding at the same time: `creator` is a copyable string, not
a fact about the document's signature. `createPresignedHeader` gives a duplicate
an empty `sig.publicKey` while the duplicate keeps the source's `creator`, so a
document can have a creator-less header and a non-`undefined` `auth.creator`,
permanently exempt from the retention rule though nobody holding its keys can
administer it.

### Proposed implementation

Validate at the door, in `applyInitialState` and `loadStateOperation`, so every
path onto `state.auth` goes through the same rules:

```ts
// Any door onto state.auth carries the same rules as INITIALIZE_AUTH.
if (merged.auth !== undefined) {
  const auth = backfillAuthState(merged.auth);
  if (auth.version > 0) {
    assertValidInitialGrants(
      auth.grants,
      document.header.documentType,
      auth.creator,
    );
  }
}
```

Separately, reject an `initialState` that changes `auth.creator` to a value the
document's own header does not support, rather than trusting the field. That
closes the escalation and the copyable-creator exemption together.

---

## Finding 6 — the policy gate decides against the wrong document

**Severity: medium**, needs both flags on.
`packages/reactor/src/executor/document-action-handler.ts:158`.

`refuseIfPolicyDenies` builds its decision target from `job.documentId`, but the
handlers it gates write elsewhere: `DELETE_DOCUMENT` and `UPGRADE_DOCUMENT` use
`input.documentId` (`:447`, `:582`) and the relationship actions use
`input.sourceId` (`:851`). Nothing forces those to agree — `reactor.execute()`
(`core/reactor.ts:580`) validates only that the actions share a scope, and never
compares action inputs to the job's document.

So a caller reaching raw `execute()` with a mismatched input gets the enforcement
point consulting a document it controls instead of the target: owning `X` with no
policy, `execute(X, "main", [DELETE_DOCUMENT{documentId: Y}])` is decided against
`X`'s absent policy and then writes the delete into `Y`'s stream. `deleteDocument()`
keys the job by the target, so the convenience API is fine; the gap is that the
executor — the enforcement point — trusts the job rather than the action.

There was no document-action gate at all before this change, so this is a gap in
new enforcement rather than a regression.

**Proposed implementation:** derive the gate's target from the action the same
way the handler does, and gate each action against the document it will actually
write:

```ts
const target = {
  documentId: targetDocumentId(action) ?? job.documentId,
  branch: job.branch,
};
```

with `targetDocumentId` reading `input.documentId` for delete and upgrade and
`input.sourceId` for the relationship actions — one function, shared with the
handlers so the two cannot drift.

---

## Finding 7 — the read filter misses `initialState`, and `subscribe()` misses `withAuthScope`

**Fixed** — commit `77fee70b4`. Both fields are filtered, and the subscription's created-document fetch wraps in `withAuthScope`. Both tests were mutation-checked against the unfixed source.

**Severity: medium.** Not flag-gated, so reachable with the flags off wherever a
policy carries a read deny. `packages/reactor/src/client/util.ts:38-54` and
`packages/reactor/src/client/reactor-client.ts:1076`.

`filterReadableScopes` rebuilds `state` and spreads the rest of the document, so
`initialState` survives untouched — and the document view returns it as the same
object shape, carrying the identical scope contents the filter just removed. A
subject denied `read` on `local` receives `state` without `local` and
`initialState.local` in full. The helper predates this PR, but `subscribe()` is
this PR's read-gate feature and ships events through it.

Separately, `subscribe()`'s created-document path fetches with the raw `view`
instead of `withAuthScope(view)`. With `{scopes: ["global"]}` the fetch omits the
auth scope, `state.auth` is absent, and `decide(undefined, …)` returns `allow`
for the uninitialized-policy case — so a scope-narrowed subscription silently
disables the gate. `client.get()` (`:158`) wraps with `withAuthScope` for exactly
this reason. The updated-document path is safe, because those documents come from
`documentView.get(id)` with all scopes.

**Proposed implementation:** filter `initialState` alongside `state` in
`filterReadableScopes` (same scope loop, same predicate), and wrap the fetch at
`reactor-client.ts:1076` in `withAuthScope`. Tests should assert on
`initialState` keys, not only `state` keys, and cover a subscription whose view
excludes `auth`.

---

## Finding 8 — the batch minimum uses a lexical compare

**Severity: medium**, needs `documentDecisions`.
`packages/reactor/src/executor/simple-job-executor.ts:830-835`.

`positionByTimestamp` selects the batch's earliest timestamp with string `<`,
then feeds it to a comparison that parses instants (`:845-846`). Mixed precision
inverts lexically: `".500Z"` sorts before `"…00Z"` because `.` is `0x2E` and `Z`
is `0x5A`, though it is the later instant. The comment at `:843-844` anticipates
exactly the input class that breaks it — a submitted timestamp carrying second
precision.

With the head at `…00.200Z` and a batch of `[…00:00Z, …00:00.500Z]`, `earliest`
becomes the later instant, `backdated` computes false, and a genuinely backdated
action is head-decided and appended at the tail — stored out of timestamp order,
while every replica receiving it by load reshuffles it into position. When
`backdated` is true anyway, the wrong `earliest` also narrows the
`getConflicting` window (`:887`) and produces an incomplete reshuffle.

This is the last comparison of the class the prior review already converted in
this file. **Proposed implementation:** parse inside the loop.

```ts
let earliest = job.actions[0].timestampUtcMs;
let earliestAt = Date.parse(earliest);
for (const action of job.actions) {
  const at = Date.parse(action.timestampUtcMs);
  if (at < earliestAt) {
    earliest = action.timestampUtcMs;
    earliestAt = at;
  }
}
```

Add a mutation-batch test with mixed-precision timestamps; nothing exercises that
input today.

---

## Finding 9 — an operation for a deleted document resurrects its slug

**Severity: medium**, needs `documentDecisions`.
`packages/reactor/src/read-models/document-view.ts:221-238`.

`resolveIdOrSlug` relaxes the `isDeleted` filter on the id branch only, and its
comment states why the slug branch is safe: "deleting a document removes its
SlugMapping rows" (`:700-701`). The generic indexing path re-inserts that row
from any operation carrying a header, with no `isDeleted` guard — and
`resultingState` always embeds the header (`simple-job-executor.ts:702-705`),
including on the denied path, whose document is built from the standing state at
`:651-657`.

So a post-deletion operation for the document — which `documentDecisions` admits,
stored denied — restores the mapping, and `getByIdOrSlug(slug)` then serves the
deletion-boundary state by slug, contradicting the invariant. Worse, the upsert's
`onConflict(slug).doUpdateSet({documentId})` steals the slug from a live document
that claimed it after the deletion.

**Proposed implementation:** skip the `SlugMapping` insert when the document's
snapshot row is marked deleted — one `isDeleted` check on the existing snapshot
lookup already in scope at `:184-190`. Test an operation arriving for an
already-deleted document, asserting both that the slug does not resolve and that
a live document's claim on the same slug survives.

---

## Finding 10 — `pnpm preflight:auth` cannot inspect a real store

**Severity: medium**, rollout tooling.
`packages/reactor/src/admin/run-stream-order-check.ts:19-21`.

The entry point opens `new PGlite()` — ephemeral, in-memory, with no migrations
run and no `.withSchema(REACTOR_SCHEMA)` scoping, unlike the real wiring at
`reactor-builder.ts:487`. Every invocation against a real fleet therefore fails
on a missing relation, identically whether the fleet's auth streams are safe or
not, and there is no parameter to point it at a store.

It fails loud rather than reporting a false "safe", and it faithfully mirrors
`run-migrations.ts`, which has the same shape. But the prior review asked for
this tool so that "enable `authEnforcement` on this fleet" would be a verifiable
step, and as written it cannot be. The exported `sweepStreamOrder` library
function is correct and tested.

**Proposed implementation:** take the connection from the same environment the
server uses (`PH_PGLITE_DIR` / the reactor's configured store), run the migrator
before sweeping, and scope to `REACTOR_SCHEMA`. Fixing `run-migrations.ts` the
same way is the natural companion change.

---

## Finding 11 — the new reducer rules have no version gate

**Severity: medium**, low likelihood today.
`packages/shared/document-model/auth-v1.ts:383` and `:454`.

Both rules are reducer-level, which means consensus-level, and neither consults
`auth.version`. History that was valid before `ffc0a3d40` and `13a32f911` — a
creator-less `INITIALIZE_AUTH` with zero grants, or a `REMOVE_GRANT` the
retention rule now rejects — behaves three different ways depending on the path:

- verifying replay (`checkHashes: false`, used by zip load) throws
  `HashMismatchError`;
- non-verifying replay and the write cache's rebuild catch the throw and stamp
  `error`, leaving `{version: 0, grants: []}` — an **open** document, which is
  the wrong direction for a tightening rule;
- the auth projection calls `applyAuthAction` with no try/catch
  (`decision/auth-decision-model.ts:65`) and the walk only skips operations that
  already carry `error` (`walk.ts:99`), so it throws out of the walk as an
  untyped error, classifying `UNCLASSIFIED` and burning the retry budget.

No production code emits `INITIALIZE_AUTH` today, so the author's "nothing has
shipped" premise holds and this is not a merge blocker. It is reproducible by a
rolling deploy where one replica is a commit behind.

**Proposed implementation:** decide explicitly and write the decision down. If
the rules are v1-and-later, gate them on `auth.version >= 1` at both call sites
and add a replay test over pre-rule history. If they are unconditional, at
minimum make the walk total — wrap `applyAuthAction` so a throwing auth operation
is treated as contributing nothing rather than failing the job — and add the
same backward-compatibility test.

---

## Lower severity and notes

- **Auth-scope `NOOP` from a hostile peer** (`simple-job-executor.ts:1481-1485`).
  The pre-existing `NOOP → skip = 1` conversion now applies to a stream that is
  never reshuffled. An auth-scope `NOOP` timestamped above the auth head passes
  the monotonic check, takes the trivial-append branch, and lands with `skip = 1`,
  retracting the newest auth operation in every skip-respecting rebuild — while
  `evaluateByPosition` filters the auth stream to `AUTH_ACTION_TYPES`, which
  excludes `NOOP`, so the walk never sees it and walk-derived decisions can
  disagree with the rebuilt `state.auth` on the same replica. Compliant peers
  never emit auth `NOOP`s. The auth branch should reject or skip-strip them.
- **Peer-supplied `errorType` is unvalidated** (`gql-req-channel.ts:392`,
  `sync-dead-letter-storage.ts:30`). Cast into the closed union and persisted
  verbatim. Unknown values fail closed (the non-quarantining set is a deny-list),
  so a hostile peer can suppress its own quarantine but not induce one; a
  membership check is a one-liner. It also means every future non-quarantining
  type is a lockstep upgrade, which is worth a comment on the union.
- **`appendWithoutApplying` does not advance `header.revision[scope]`**
  (`shared/document-model/documents.ts:457`). New in this PR; on `main` the
  reducer advanced it. The reactor survives because `stampRevisions`
  (`kysely-write-cache.ts:892-906`) overwrites the value from the operation
  store, but client-side replay consumers do not get that: `getNextIndexForScope`
  and `stampAction`'s `prevOpIndex` both derive from `header.revision[scope]`, so
  a replayed history ending in a denied operation targets an index that operation
  already occupies.
- **`localeCompare` in the consensus comparator** (`decision/merged-order.ts:54-61`),
  pre-existing. It breaks equal-timestamp cross-stream ties, and it is locale- and
  ICU-sensitive: `"A1".localeCompare("a1")` returns `+1` where codepoint order
  gives `-1`. The comparator's stated purpose is that two replicas agree on order
  regardless of storage order, and browser clients and node switchboards do not
  share an ICU build. This PR adds the auth-wins rule directly above it and its
  new test comments the uuid `localeCompare` dependency, so it is the right moment
  to switch to `<`/`>`.
- **Re-evaluation over-triggers** (`simple-job-executor.ts:1127-1139`),
  pre-existing. `latestTimestamp` is read after the batch's own rows are written
  and maxes over all of them, so any multi-action batch with distinct timestamps
  looks backdated against itself and triggers a full pass. Not introduced here,
  but this PR multiplies its cost: each pass now re-reads the auth stream once per
  evaluated scope.
- **`resolveIdOrSlug(identifier, view?, signal?)`** (`client/types.ts:249`)
  inserts a parameter mid-signature. No in-repo caller passes a signal
  positionally, and TS callers get a loud error, but untyped callers would
  silently lose abort. Worth a release note.
- **Projection-worker flag transport** (`build-projection-stack.ts:130-132`)
  hardcodes `servesDeletionBoundary: false` because its init payload carries no
  feature flags, while executor workers do receive them. Write-only today; the
  two worker protocols disagreeing about flag transport is a trap worth closing.
- **`docs/specs/auth-scope.md:711`** says the configuration carries four flags
  while `feature-flags.ts` declares two, consistent with declare-when-shipped.
  Present-tense wording is ahead of the code.
- **Cosmetics.** `simple-job-executor.ts:1059-1064` labels an invalid _action_
  timestamp with context `"auth operation"`. `refusalError`
  (`executor/util.ts:260-275`) collapses the three auth refusal reasons into one
  `AuthorizationDeniedError` message, though the persisted `deniedReason` keeps
  full fidelity. `apps/switchboard/src/server.mts:435` has a comment typo,
  "documentDecisiopns".

## Other observations

### Security

The fail-closed posture is right where it is exercised: default-deny once a
policy exists, the creator carve-out checked before the version gate so an
unknown policy version cannot brick its own administration, slug resolution never
relaxed for a deleted document, and `filterReadableScopes` applied at the client
boundary so internal consumers keep seeing everything.

The gaps are all at doors rather than in the evaluator: finding 1 (a rule that
checks shape instead of asking the evaluator), finding 5 (two writers onto
`state.auth` that skip validation entirely), finding 6 (the gate trusting the job
over the action), and finding 7 (a filter that rebuilds one field and spreads the
rest). Each is a case of a check sitting beside the authoritative path instead of
on it.

### Performance

`evaluateByPosition` re-reads each read-set stream per evaluated scope and
`reevaluateDocument` loops scopes, so a document with N evaluated scopes issues
N × streams indexed queries per triggering write. The `decidingActions` narrowing
keeps result sets small and the early return covers the empty case. Combined with
the over-trigger noted above, the thing to measure before a third projection
lands is passes per write, not cost per pass.

### Test coverage

The +3370 test lines hit the right seams, and the six areas probed hardest came
back clean. The gap is assertion shape rather than volume, and it is the same
shape three times — a harness that stubs out the layer the defect lives in:

- the retention tests assert "an error operation was recorded" or "the grant list
  is unchanged", and never that the resulting policy is still administrable —
  which is exactly the property the rule exists to guarantee, and exactly why
  finding 1 survived;
- the sync tests construct `ChannelError(Inbox, typedError)` by hand rather than
  driving a real failed load job, which is why finding 2 is invisible;
- the hub-spoke integration test replaces the GraphQL transport with a resolver
  bridge that substring-matches the query and never validates it against a
  schema, which is why finding 4 cannot fail there — and why a green
  `test:integration` was read as confirming a fix that had not been made.

Each is one assertion at the right level, but note that in all three cases the
assertion has to be added _outside_ the existing harness: a policy probe after an
accepted mutation, a genuinely failed load job, and a query validated against the
previous release's schema. Other gaps worth closing with the findings they belong
to: no mixed-precision mutation batch (8), no document-action whose input names a
different document than the job (6), no operation arriving for an already-deleted
document (9), no `initialState` assertion or auth-excluded subscription view (7),
no CLI test for the pre-flight (10), and no pre-rule auth history replay (11).

### Migration and rollout

Migration 016 is additive, `notNull().defaultTo("UNCLASSIFIED")`, coalesced on
read, with a `down` — correct on both sides, and safe on populated tables.
`errorType` and `deniedReason` are nullable in the schema and `serializeEnvelope`
omits `deniedReason` when undefined, so an old peer receiving pushes is
unaffected; the poll direction is finding 4.

The rollout story is what needs work before the flags go on: the pre-flight that
was meant to gate it cannot read a store (10), the classification that makes the
monotonic rule survivable never fires (2) and would not survive a restart if it
did (3), and the deployment ordering the wire change imposes is undocumented (4).

## Suggested order of work

| #   | Item                                                                         | Effort          | Blocking?              |
| --- | ---------------------------------------------------------------------------- | --------------- | ---------------------- |
| —   | Prettier on `server.mts` and `remote-controller/utils.test.ts`               | trivial         | **done** — `cb2045ed5` |
| 1   | Finding 1 — reachability probe + `MOVE_GRANT` + fixture + assertion          | medium          | **merge**              |
| 2   | Finding 5 — validate every door onto `state.auth`; reject creator changes    | medium          | **merge**              |
| 3   | Finding 4 — document server-first ordering, or probe the schema              | small           | **merge** (still open) |
| 4   | Finding 7 — filter `initialState`; `withAuthScope` in `subscribe()`          | small           | **merge** (narrow)     |
| 5   | Finding 2 — `name` on `ErrorInfo`, classify at both wrap sites               | small           | before flags on        |
| 6   | Finding 3 — pass `record.errorType`                                          | trivial         | before flags on        |
| 7   | Finding 6 — gate against the action's target document                        | small           | before flags on        |
| 8   | Finding 8 — parse in the min loop                                            | trivial         | before flags on        |
| 9   | Finding 9 — no slug insert for a deleted document                            | small           | before flags on        |
| 10  | Finding 10 — real connection for `preflight:auth`                            | small           | before flags on        |
| 11  | Finding 11 — decide the version gate; make the walk total                    | small / discuss | before flags on        |
| 12  | Notes — auth `NOOP`, `errorType` validation, `localeCompare`, revision drift | small           | opportunistic          |

Items 5 and 6 are one piece of work in practice: the classification is only
useful if it survives both the wrap and a restart, and testing either one
properly means driving a real failed load job, which covers both.

One process note, since it caused a false positive on finding 4. Three of the
open findings — 2, 4 and 9 — are invisible to the suites that would seem to cover
them, because each one's test harness stubs out exactly the layer where the defect
lives: the resolver bridge removes schema validation, the sync tests build
`ChannelError` by hand instead of failing a real job, and nothing indexes an
operation against an already-deleted document. A green suite is evidence about the
paths the suite exercises, and for these three that set excludes the defect.
