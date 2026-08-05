# Review: auth scope stage 4 (`authEnforcement`)

Review of the uncommitted work on `feat/auth-v4` — 78 files, +5041/−314. Line
numbers are as of the working tree at review time and will drift; each item
names the symbol so it stays findable.

## Verification run

| Check | Result |
| --- | --- |
| `packages/reactor` — `pnpm tsc --build` | clean |
| `packages/shared` — `pnpm tsc --build` | clean |
| `packages/reactor` — `pnpm vitest run test/decision test/executor test/sync test/storage/… test/core/feature-flags.test.ts` | 64 files, 1062 tests pass |
| `packages/reactor` — `pnpm vitest run test/client test/read-models test/cache` | 28 files, 585 tests pass |
| `packages/document-model` — `pnpm vitest run test/document-model/replay.test.ts test/document-model/auth-decide.test.ts test/document/auth-persistence.test.ts` | 3 files, 39 tests pass |

Finding 1 was reproduced with a scratch test (removed afterwards); the
reproduction appears verbatim below as the regression test to add.

## Status since the review

The working tree has moved. Re-checked against it:

| Item | Status |
| --- | --- |
| Finding 1 | **applied** — commit `e8186ff83` |
| Finding 4 | **applied** — commit `408d0320a` |
| Finding 5 | **applied** — commit `33cd95642` |
| Finding 2 | **applied** — commit `d62e23450`; the `checkStreamOrder` / `StreamOrderResult` half was moot — both were removed, so only `firstOutOfOrderPair` needed the fix |
| Finding 3 | **applied** — commit `64d9c3408`; `pnpm preflight:auth` + exported `sweepStreamOrder` |
| Finding 6 (action-list duplication) | **applied** — see below |
| Finding 7 (`evaluationOrder`) | **applied** — commit `a93f176d9` |
| Design notes + minor cosmetics | **applied** — commit `81d2c1b30`; the unsigned-document grant rule has since landed (`ffc0a3d40`) and the `deletedAtUtcIso` message improvement is closed as accepted-as-is |
| Hypercore lexicographic max | dropped from this review at the author's request |

Two refactors also changed things this doc referenced:

- the four `deniedReason` strings now live in
  `packages/shared/document-model/operations.ts` next to `isDenied`, rather than
  being split between `auth-decision-model.ts` and `document-decision-model.ts`;
- `IRegisteredDecisionModel` and its two subclasses are gone.
  `RegisteredDecisionModel` is now a factory *type*
  (`(target) => DecisionModel<DocumentDecisionModel>`) and `decideAtHead` is a
  free function, so callers pass the model in rather than calling methods on it.

## What the change does

`authEnforcement` adds the **auth stream as a second projection** in the
decision model, so a write is decided against the policy as it stood *at that
write's position* rather than at the stream head.

- `decision/registered-model.ts` — `selectDecisionModel` picks document-only vs
  document+auth from the flags, so a stream a flag has not enabled is never read
  at all. `RegisteredDecisionModel` is the factory type both models satisfy, and
  `decideAtHead` builds a model at the stream heads and decides one request
  against it.
- `decision/auth-decision-model.ts` — the auth projection, mapping an
  `AuthRefusal` onto one of the persisted reason strings in
  `shared/document-model/operations.ts`.
- `shared/document-model/auth.ts` — `evaluate()` / `evaluateGrantStack()` return
  *why* a request was refused; `decide()` / `evaluateGrants()` remain as
  reason-dropping wrappers.
- `decision/walk.ts` — `walkByPosition` becomes a two-way generator so the
  consumer feeds the verdict back, and a denial produced by *this* pass
  suppresses the operation the way a stored one does.
- **Monotonic auth stream** — an auth write must strictly exceed the stream's
  maximum timestamp, and the stream is never reshuffled. Violations are
  terminal, dead-lettered, and deliberately non-quarantining.
- Dead-letter classification (`errorType`) persisted via migration 016, carried
  over GraphQL, and mirrored by peers.
- `ExcessiveReshuffleError` discounts re-appended actions, so revocation over a
  long history is not self-blocking.
- Read side: denied operations are no longer applied on replay; a deleted
  document serves boundary state by id but never by slug; `subscribe()` filters
  readable scopes.

Comment quality is unusually high. Two notes are worth keeping as-is because
they encode constraints that are otherwise invisible: the "these reason strings
are consensus data, changing one is history-visible" block now above the
constants in `shared/document-model/operations.ts`, and the "run after the dedup,
never before" block in `simple-job-executor.ts`. The `0 → -1` read-bound fix in
`evaluation.ts` is correct and correctly explained.

---

## Finding 1 — `replayDocumentVersioned` throws on any history containing a denied operation

**Resolved** — commit `e8186ff83` (2026-08-04). All four steps applied as proposed: `appendWithoutApplying` exported from `documents.ts`, used in the versioned segment loop, the write cache's private copy collapsed onto it, and the regression test added (verified to fail with the doc's exact stack trace before the fix).

**Severity: high.** `packages/shared/document-model/versioned-replay.ts`, in the
per-segment loop inside `replayDocumentVersioned` (~line 236).

### Symptom

`documents.ts:replayDocument` was fixed properly for this change: a denied
operation is recorded via `appendWithoutApplying`, so it occupies its index and
contributes no state. The versioned path only skips the reducer:

```ts
for (const op of segOps) {
  // A denied operation holds its position without contributing state, the
  // same way the reactor's own rebuild treats it.
  if (!isDenied(op)) {
    document = reducer(document, op.action, dispatch, { … });
  }
  segmentEndHashPerScope.set(s, hashDocumentStateForScope(document, s));
}
```

Because the operation is never appended to `document.operations[scope]`, the
reducer's index-continuity check rejects the *next* operation:

```
Error: Missing operations: expected 1 with skip 0 or equivalent, got index 2 with skip 0
  ❯ updateOperationsForOperation shared/document-model/reducer.ts:138
  ❯ updateDocument                shared/document-model/reducer.ts:180
  ❯ baseReducer                   shared/document-model/reducer.ts:465
  ❯ replayDocumentVersioned       shared/document-model/versioned-replay.ts:240
```

Reproduced with `global: [ok, denied, ok]` and a `fromVersion: 0`
`UPGRADE_DOCUMENT` in the spine.

The versioned path is the **normal** path for versioned documents — only a spine
with no `fromVersion: 0` upgrade (or no seed state) falls back to
`replayDocument`. This is not upgrade-only.

### Blast radius

None of the three call sites pass `skipIndexValidation`:

| Call site | Effect |
| --- | --- |
| `reactor-browser/src/actions/document.ts:965` | duplicate document throws |
| `reactor-drive/src/client/reactor-drive-client.ts:473` | duplicate document throws |
| `shared/document-model/files.ts:234` (`baseLoadFromInputVersioned`) | zip load throws unless the caller opts out of index validation |

Secondary symptom when index validation *is* disabled: the trailing remap is
positional —

```ts
resultOperations[s] = scopeResultOps.map((op, index) => ({
  ...op,
  timestamp: operations[s]?.[index]?.timestampUtcMs ?? op.timestampUtcMs,
}));
```

— so with a denial dropped from `document.operations[s]`, every operation after
it silently inherits the previous operation's timestamp. The returned
`operations` map also loses the denial entirely, because
`{ ...operations, ...resultOperations }` lets `resultOperations` win for every
non-`document` scope.

### Proposed implementation

There are already two divergent private copies of this helper —
`shared/document-model/documents.ts` (2-arg, derives the scope from
`operation.action.scope`) and `reactor/src/cache/kysely-write-cache.ts` (3-arg,
takes the scope explicitly). Promote one and delete the other two.

**Step 1** — export a single helper from `documents.ts` (it is already
downstream of `operations.ts`, so no import cycle):

```ts
// packages/shared/document-model/documents.ts

/**
 * Records an operation in the history without applying it, which is what a
 * denied operation needs: it occupies its index and contributes no state.
 *
 * The scope defaults to the action's own, and is passed explicitly by a rebuild
 * that is walking one stream and does not want to trust the action's copy.
 */
export function appendWithoutApplying<TState extends PHBaseState>(
  document: PHDocument<TState>,
  operation: Operation,
  scope: string = operation.action.scope,
): PHDocument<TState> {
  return {
    ...document,
    operations: {
      ...document.operations,
      [scope]: [...(document.operations[scope] ?? []), operation],
    },
  };
}
```

`packages/shared/document-model/index.ts` already does
`export * from "./documents.js"`, so no barrel change is needed.

**Step 2** — use it in the versioned segment loop:

```ts
// packages/shared/document-model/versioned-replay.ts
      for (const op of segOps) {
        // A denied operation holds its position without contributing state, the
        // same way the reactor's own rebuild treats it. It is still recorded, or
        // the operation after it fails index validation and the timestamp remap
        // below shifts onto the wrong rows.
        if (isDenied(op)) {
          document = appendWithoutApplying(document, op, s);
        } else {
          document = reducer(document, op.action, dispatch, {
            ignoreSkipOperations: true,
            checkHashes,
            skipIndexValidation,
            replayOptions: { operation: op },
            protocolVersion,
          }) as PHDocument<TState>;
        }
        segmentEndHashPerScope.set(s, hashDocumentStateForScope(document, s));
      }
```

The spine loop's `if (isDenied(spineOp)) continue;` stays as-is and needs no
append: `allResultScopes.delete("document")` means the document scope's
operations come straight from the input, never from `document.operations`.

**Step 3** — collapse the write cache's private copy:

```ts
// packages/reactor/src/cache/kysely-write-cache.ts
-function appendWithoutApplying(
-  document: PHDocument,
-  scope: string,
-  operation: Operation,
-): PHDocument { … }

 import {
+  appendWithoutApplying,
   applyDeleteDocumentAction,
   …
 } from "@powerhousedao/shared/document-model";
```

and at both call sites (the cold-miss scope rebuild and the warm-miss rebuild,
~lines 863 and 1070):

```ts
-            document = appendWithoutApplying(document, scope, operation);
+            document = appendWithoutApplying(document, operation, scope);
```

**Step 4** — regression test, mirroring the existing non-versioned one in
`replay.test.ts`. This is the reproduction that currently fails:

```ts
// packages/document-model/test/document-model/replay.test.ts

it("records a denied operation in a versioned replay without applying it", () => {
  const seed = createCountState();
  const header = { /* protocolVersions: { "base-reducer": 1 }, revision: { global: 0, local: 0, document: 0 }, … */ } as never;

  let doc = countReducer({ header, state: seed, initialState: seed, operations: { global: [], local: [] }, clipboard: [] } as never, increment());
  doc = countReducer(doc, increment());
  const [first, second] = doc.operations.global;

  const denied = {
    ...first,
    id: "op-denied",
    index: 1,
    action: { ...first.action, id: "a-denied" },
    hash: first.hash,
    deniedReason: "no grant permits this operation",
  } as Operation;

  // A fromVersion:0 upgrade in the spine is what selects the versioned path
  // rather than the legacy fallback.
  const documentOps = [
    { id: "op-create",  index: 0, skip: 0, hash: "", timestampUtcMs: "2026-01-01T00:00:00.000Z",
      action: { id: "a-create",  type: "CREATE_DOCUMENT",  scope: "document", timestampUtcMs: "2026-01-01T00:00:00.000Z", input: { model: "count" } } },
    { id: "op-upgrade", index: 1, skip: 0, hash: "", timestampUtcMs: "2026-01-01T00:00:00.000Z",
      action: { id: "a-upgrade", type: "UPGRADE_DOCUMENT", scope: "document", timestampUtcMs: "2026-01-01T00:00:00.000Z", input: { fromVersion: 0, toVersion: 1, initialState: seed } } },
  ] as unknown as Operation[];

  const result = replayDocumentVersioned(
    seed,
    { document: documentOps, global: [first, denied, { ...second, index: 2 }], local: [] },
    { reducers: { 1: countReducer as never } },
    header,
    undefined,
    { checkHashes: false },
  );

  // Two increments applied, not three, and the refusal still holds its index.
  expect(result.state.global.count).toBe(2);
  expect(result.operations.global).toHaveLength(3);
  expect(result.operations.global[1].deniedReason).toBe(
    "no grant permits this operation",
  );
  // Index validation did not fire, which is what the append is for.
  expect(result.operations.global.map((o) => o.index)).toEqual([0, 1, 2]);
});
```

**Effort:** small. **Risk:** low — the fix makes the versioned path match the
non-versioned path that already has coverage.

---

## Finding 2 — equal-timestamp auth history is unsyncable, and the pre-flight check cannot see it

**Resolved** — commit `d62e23450` (2026-08-04). `OutOfOrderPair.kind` + `requireStrict` landed as proposed, with the tie/descent unit tests and the end-to-end agreement test in `test/decision/auth-monotonic.test.ts`; the old "keeps an equal timestamp in stored index order" test was subsumed by the new tie test, and `DocumentIntegrityService.findStreamOrderIssues` (which still calls `firstOutOfOrderPair`, contrary to the removal noted above) was left non-strict, preserving its behavior — the strictness default it should own is finding 3's scope (since made strict for `auth` in `2fea285b8`).

**Severity: medium.** `packages/reactor/src/decision/stream-order.ts`
(`firstOutOfOrderPair`) versus `simple-job-executor.ts`
(`firstNonMonotonicTimestamp`).

### Symptom

The write and load paths reject `<=`:

```ts
const at = Date.parse(entry.timestampUtcMs);
if (at <= bound) {
  return new AuthTimestampNotMonotonicError(…);
}
```

The pre-flight check only detects strict descent. `firstOutOfOrderPair` compares
through `comparePositions` with the same `streamKey` and `scope` on both sides,
so an equal timestamp falls through to `a.operation.index - b.operation.index`,
which is ascending after `garbageCollect(sortOperations(...))`. A stream holding
two same-millisecond auth operations therefore reports `isOrdered: true`.

`stream-order.ts` documents itself as the fleet-migration gate — *"the auth
stream is never reshuffled once the monotonic rule is on, so run this before
enabling enforcement on a fleet"* — so the gate passes exactly the history that
will fail.

### Consequence

A replica that does not yet hold that auth history dead-letters it permanently:
`firstNonMonotonicTimestamp` carries `bound` forward within the batch, so the
second same-millisecond operation trips on the first. Because
`AUTH_TIMESTAMP_NOT_MONOTONIC` is deliberately non-quarantining, the document
keeps syncing while its auth history never arrives — the failure is silent
rather than loud.

### Proposed implementation

The walk tolerates a tie; the monotonic auth rule does not. Make the check
report both conditions and let the caller pick which one is fatal.

```ts
// packages/reactor/src/decision/stream-order.ts

/** Where a stream's stored order contradicts its timestamps. */
export type OutOfOrderPair = {
  previous: Operation;
  current: Operation;
  /**
   * `descending` cannot be walked at all. `tied` walks fine — the intra-stream
   * rule breaks the tie by index — but violates the monotonic auth rule, so a
   * stream holding one can never be replicated to a peer that lacks it.
   */
  kind: "descending" | "tied";
};

/**
 * The first pair of effective operations whose stored order contradicts their
 * timestamps, or undefined when the stream is in position order.
 *
 * Such a stream cannot be walked, and the auth stream is never reshuffled once
 * the monotonic rule is on, so run this before enabling enforcement on a fleet.
 *
 * `requireStrict` additionally rejects a tie, which is what the auth stream's
 * monotonic rule requires and what the walk alone does not care about.
 */
export function firstOutOfOrderPair(
  operations: Operation[],
  options?: { requireStrict?: boolean },
): OutOfOrderPair | undefined {
  const requireStrict = options?.requireStrict ?? false;
  const effective = garbageCollect(sortOperations([...operations]));

  for (let i = 1; i < effective.length; i++) {
    const previous = effective[i - 1];
    const current = effective[i];

    // Parsed rather than compared through comparePositions: one stream makes the
    // cross-stream rules inert, and a tie has to be visible here rather than
    // resolved by index.
    const previousAt = Date.parse(previous.timestampUtcMs);
    const currentAt = Date.parse(current.timestampUtcMs);

    if (currentAt < previousAt) {
      return { previous, current, kind: "descending" };
    }
    if (requireStrict && currentAt === previousAt) {
      return { previous, current, kind: "tied" };
    }
  }

  return undefined;
}
```

`comparePositions` already derives its timestamps with `Date.parse`, so the
descending branch is behaviour-preserving.

The earlier version of this review also proposed turning `StreamOrderResult` into
a discriminated union and threading a strictness option through
`IDocumentIntegrityService.checkStreamOrder`. Both have since been deleted from
the working tree, so `firstOutOfOrderPair` is now the whole surface and the
`kind` discriminator above carries the information the removed result type would
have. Whoever reintroduces an admin method should default `requireStrict` to
`scope === "auth"` rather than making every caller remember.

Tests to add in `test/decision/stream-order.test.ts`:

```ts
it("reports a tie only when strictness is asked for", () => {
  const ops = [
    op({ index: 0, timestampUtcMs: "2026-01-01T00:00:01.000Z" }),
    op({ index: 1, timestampUtcMs: "2026-01-01T00:00:01.000Z" }),
  ];

  expect(firstOutOfOrderPair(ops)).toBeUndefined();
  expect(firstOutOfOrderPair(ops, { requireStrict: true })).toMatchObject({
    kind: "tied",
    previous: { index: 0 },
    current: { index: 1 },
  });
});

it("reports descent whether or not strictness is asked for", () => { … kind: "descending" … });
```

and one end-to-end test asserting the load path and the pre-flight check agree —
a stream the pre-flight passes must not produce
`AuthTimestampNotMonotonicError` when replayed onto an empty replica.

**Effort:** small. **Risk:** low. **Sequencing:** this has to land before
`authEnforcement` is enabled anywhere with existing auth history, because it is
the only thing that tells an operator whether enabling is safe.

---

## Finding 3 — the order pre-flight has no operator entry point

**Resolved** — commit `64d9c3408` (2026-08-04). `pnpm preflight:auth` runs `src/admin/run-stream-order-check.ts` with the run-migrations db wiring, exit 0/1 as specified; one deviation from the sketch — the sweep lives in `src/admin/stream-order-sweep.ts` as an exported `sweepStreamOrder(db, store, scope = "auth")` (strict when `scope === "auth"`) so the PGlite unit test in `test/storage/stream-order-sweep.test.ts` can import it without triggering the CLI's `void main()`, mirroring the migrator.ts/run-migrations.ts split. Follow-up, decided 2026-08-04: the minimal half landed as commit `2fea285b8` — `findStreamOrderIssues` passes `requireStrict` for the `auth` scope and `StreamOrderIssue` surfaces the pair's `kind`, so `validateDocument` and `pnpm preflight:auth` agree; the Connect `useIntegrityInspector` wiring and a public `checkStreamOrder` are deliberately deferred.

**Severity: low.** `packages/reactor/src/decision/stream-order.ts`.

`firstOutOfOrderPair` documents itself as the thing to run before enabling
enforcement on a fleet, and nothing runs it. It is exported from the reactor
barrel (`index.ts`) and has no in-repo caller outside its own unit test: the
`DocumentIntegrityService.checkStreamOrder` wrapper that used to front it has
been removed, `reactor-api` has no admin surface, and Connect's inspector modal
is wired to `validateDocument` only. An operator following the documentation has
nothing to run.

This is the migration gate for finding 2, so it matters more than its severity
suggests: without it, "enable `authEnforcement`" is an unverifiable step.

### Proposed implementation

Follow the existing `pnpm migrate` precedent (`src/storage/migrations/run-migrations.ts`)
rather than adding an API surface. The check needs only the operation store, so
it does not have to reintroduce the integrity-service wrapper.

```ts
// packages/reactor/src/admin/run-stream-order-check.ts
import { Kysely } from "kysely";
import { firstOutOfOrderPair } from "../decision/stream-order.js";
import { KyselyOperationStore } from "../storage/kysely/store.js";

/**
 * Pre-flight for `authEnforcement`. Sweeps every stream that carries auth
 * operations and reports the ones the auth projection could not walk, or that
 * the monotonic rule would refuse to replicate.
 *
 * Exits non-zero when anything is reported, so it can gate a rollout.
 */
async function main() {
  const scope = process.argv[2] ?? "auth";
  const db = openDb(); // same connection wiring as run-migrations.ts
  const operationStore = new KyselyOperationStore(db /* … */);

  const streams = await db
    .selectFrom("Operation")
    .select(["documentId", "branch"])
    .where("scope", "=", scope)
    .distinct()
    .execute();

  let failed = 0;
  for (const { documentId, branch } of streams) {
    const stored = await operationStore.getSince(
      documentId, scope, branch, -1, undefined, undefined, undefined,
    );
    const pair = firstOutOfOrderPair(stored.results, {
      requireStrict: scope === "auth",
    });
    if (!pair) continue;

    failed++;
    console.error(
      `${documentId} ${scope}@${branch}: ${pair.kind} — ` +
        `index ${pair.previous.index} (${pair.previous.timestampUtcMs}) ` +
        `then index ${pair.current.index} (${pair.current.timestampUtcMs})`,
    );
  }

  console.log(
    `${streams.length} stream(s) checked, ${failed} unsafe for authEnforcement`,
  );
  process.exit(failed === 0 ? 0 : 1);
}
```

```jsonc
// packages/reactor/package.json
"scripts": {
  …
  "preflight:auth": "tsx src/admin/run-stream-order-check.ts"
}
```

Also worth doing while here: surface the same check in Connect's
`useIntegrityInspector`, alongside `validateDocument`. That is the argument for
reinstating a `checkStreamOrder` method on `IDocumentIntegrityService` after all
— one place that owns the strictness default, rather than the script and the
inspector each picking their own.

**Effort:** small. **Risk:** none — read-only.

---

## Finding 4 — `refuseIfPolicyDenies` gates on `authEnforcement` alone

**Resolved** — commit `408d0320a` (2026-08-04). Both parts applied as proposed — the `documentDecisions` guard in `refuseIfPolicyDenies` and constructor validation via the existing `validateFeatureFlags`/`FLAG_PREREQUISITES` from `core/feature-flags.ts` (already shared, nothing to extract) — plus the constructor test; no existing test constructed the invalid combination, so nothing needed fixing.

**Severity: low.** `packages/reactor/src/executor/document-action-handler.ts:140`,
in `refuseIfPolicyDenies`.

Every other enforcement site requires `documentDecisions` as well:
`positionByTimestamp` returns `plain()` early without it, the admission branch in
`processWrite` is `if (this.featureFlags.documentDecisions && !alreadyEvaluated)`,
and `alreadyEvaluated()` itself is `documentDecisions && …`. This one is not:

```ts
    if (
      !this.featureFlags.authEnforcement ||
      this.alreadyEvaluated(executing) ||
      !GATED_DOCUMENT_ACTIONS.has(action.type)
    ) {
      return undefined;
    }
```

`ReactorBuilder.validateFeatureFlags` makes `{authEnforcement: true,
documentDecisions: false}` unreachable through the builder, but
`SimpleJobExecutor` is also constructed directly — the worker pool and the tests
both do — from raw flags, and it applies its own `?? false` defaults rather than
re-validating. In that combination document-scope writes are gated while nothing
else is, and `alreadyEvaluated()` is permanently false so there is no positional
path to repair a backdated one.

### Proposed implementation

```ts
// packages/reactor/src/executor/document-action-handler.ts
     if (
+      !this.featureFlags.documentDecisions ||
       !this.featureFlags.authEnforcement ||
       this.alreadyEvaluated(executing) ||
       !GATED_DOCUMENT_ACTIONS.has(action.type)
     ) {
       return undefined;
     }
```

Belt and braces, and cheap: have the executor validate what it was handed rather
than trusting its caller, so a pooled worker fails loudly instead of enforcing
half a model:

```ts
// packages/reactor/src/executor/simple-job-executor.ts, in the constructor
    this.featureFlags = {
      documentDecisions: config.featureFlags?.documentDecisions ?? false,
      authEnforcement: config.featureFlags?.authEnforcement ?? false,
    };
+   // The builder validates too, but a pooled worker is constructed directly
+   // from the flags that crossed the boundary.
+   validateFeatureFlags(this.featureFlags, FLAG_PREREQUISITES);
    this.decisionModel = selectDecisionModel(this.featureFlags);
```

Test: construct `SimpleJobExecutor` with `{authEnforcement: true}` only and
assert it throws `Reactor feature flag authEnforcement requires documentDecisions`.

**Effort:** trivial. **Risk:** low — check that no existing test constructs the
executor with that combination first.

---

## Finding 5 — invalid-timestamp failures are untyped, so they retry and then quarantine

**Resolved** — commit `33cd95642` (2026-08-04). All five steps applied as proposed — `InvalidOperationTimestampError`, the `INVALID_TIMESTAMP` classification (quarantining), the terminal check in `JobResultHandler`, and all three executor throw sites typed — plus both tests; one deviation: the dead `boundIso ?? new Date(0).toISOString()` fallback is dropped by narrowing the guard to `boundIso !== undefined && at <= bound` (behavior-identical, since an undefined bound is `-Infinity`), which is what TypeScript needs to see the unreachability. No GraphQL change needed — the enum lives only in `sync/types.ts`; `schema.graphql` carries `errorType` as a plain `String`.

**Severity: low.** `packages/reactor/src/executor/simple-job-executor.ts`, three
sites: `processActions` (~line 372), `firstNonMonotonicTimestamp` (~line 1039),
and the load-path scan (~line 1259).

All three return a bare `Error`:

```ts
return new Error(
  `Invalid timestamp "${entry.timestampUtcMs}" on auth operation`,
);
```

Consequences: `classifyJobFailure` maps it to `UNCLASSIFIED`, which
`quarantinesDocument` treats as quarantining; and `JobResultHandler` does not
recognise it as terminal, so a deterministically malformed timestamp burns the
whole retry budget before the document is frozen. This change applies exactly
the opposite reasoning to `AuthTimestampNotMonotonicError` and
`ExcessiveReshuffleError` — *"Both are deterministic on every attempt, so
retrying only re-runs the whole load to fail identically."* A malformed
timestamp is at least as deterministic.

### Proposed implementation

**Step 1** — a typed error, alongside the two the change already adds:

```ts
// packages/reactor/src/shared/errors.ts

/**
 * An operation or action carried a timestamp that is not an ISO-8601 UTC
 * instant.
 *
 * Terminal rather than retryable: the value does not change between attempts,
 * so a retry re-runs the whole job to fail identically. Quarantining, unlike a
 * held auth operation — this is malformed data rather than two replicas
 * disagreeing, and nothing further from that source should be trusted until it
 * is looked at.
 */
export class InvalidOperationTimestampError extends Error {
  public readonly documentId: string;
  public readonly scope: string;
  public readonly timestampUtcMs: string;

  constructor(documentId: string, scope: string, timestampUtcMs: string, context: string) {
    super(
      `Invalid timestamp "${timestampUtcMs}" on ${context} in scope "${scope}" of document ${documentId}`,
    );
    this.name = "InvalidOperationTimestampError";
    this.documentId = documentId;
    this.scope = scope;
    this.timestampUtcMs = timestampUtcMs;

    Error.captureStackTrace(this, InvalidOperationTimestampError);
  }

  static isError(error: unknown): error is InvalidOperationTimestampError {
    return Error.isError(error) && error.name === "InvalidOperationTimestampError";
  }
}
```

**Step 2** — classify it, and add the sync type:

```ts
// packages/reactor/src/sync/types.ts
   | "AUTH_TIMESTAMP_NOT_MONOTONIC"
+  /** An arriving operation carried a timestamp that is not an ISO-8601 instant. */
+  | "INVALID_TIMESTAMP"
   /** No classification applies, including rows written before the field. */
   | "UNCLASSIFIED";
```

```ts
// packages/reactor/src/sync/utils.ts, in classifyJobFailure
    case "AuthTimestampNotMonotonicError":
      return "AUTH_TIMESTAMP_NOT_MONOTONIC";
+   case "InvalidOperationTimestampError":
+     return "INVALID_TIMESTAMP";
    case "ExcessiveReshuffleError":
      return "EXCESSIVE_SHUFFLE";
```

`NON_QUARANTINING_ERROR_TYPES` stays as it is — malformed data *should*
quarantine.

**Step 3** — make it terminal:

```ts
// packages/reactor/src/executor/job-result-handler.ts
     if (
       result.error &&
       (DocumentDeletedError.isError(result.error) ||
         AuthorizationDeniedError.isError(result.error) ||
-        // Both deterministic, so retrying only re-runs the load to fail the same.
+        // All deterministic, so retrying only re-runs the load to fail the same.
         AuthTimestampNotMonotonicError.isError(result.error) ||
+        InvalidOperationTimestampError.isError(result.error) ||
         ExcessiveReshuffleError.isError(result.error))
     ) {
```

**Step 4** — replace all three throw sites, e.g.:

```ts
      if (!isValidISOTimestamp(entry.timestampUtcMs)) {
        return new InvalidOperationTimestampError(
          documentId, "auth", entry.timestampUtcMs, "auth operation",
        );
      }
```

`firstNonMonotonicTimestamp` already receives `documentId` and `branch`; the
other two sites have `job` in scope.

**Step 5** — while here, drop the dead fallback in
`AuthTimestampNotMonotonicError`'s construction: `boundIso ?? new Date(0).toISOString()`
can never be reached, because `boundIso === undefined` implies
`bound === Number.NEGATIVE_INFINITY` and no timestamp satisfies `at <= -Infinity`.

Tests: extend `test/sync/failure-classification.test.ts` with the new mapping,
and `test/executor/job-result-handler/unit.test.ts` with the terminal case.

**Effort:** small. **Risk:** low.

---

## Finding 6 — the gated-action list is duplicated — **APPLIED**

**Severity: nit.** Was `document-action-handler.ts:28` versus
`simple-job-executor.ts:94`: `GATED_DOCUMENT_ACTIONS` was exactly
`documentScopeActions` minus `CREATE_DOCUMENT`, maintained by hand in two files,
so a seventh document action added to one and not the other would either escape
the policy gate or be routed nowhere.

Both constants now live in `packages/reactor/src/executor/util.ts`, with the
gated set derived rather than restated:

```ts
/** Actions the reactor reduces itself, onto the document scope. */
export const DOCUMENT_SCOPE_ACTIONS: ReadonlySet<string> = new Set([
  "CREATE_DOCUMENT",
  "DELETE_DOCUMENT",
  "UPGRADE_DOCUMENT",
  "ADD_RELATIONSHIP",
  "REMOVE_RELATIONSHIP",
  "UPDATE_RELATIONSHIP",
]);

/**
 * `CREATE_DOCUMENT` is exempt by necessity: it runs before the document exists,
 * so building a decision model would throw and defer the job forever.
 */
export const GATED_DOCUMENT_ACTIONS: ReadonlySet<string> = new Set(
  [...DOCUMENT_SCOPE_ACTIONS].filter((type) => type !== "CREATE_DOCUMENT"),
);
```

Both files import from there and the local copies are gone. Nothing further
needed.

---

## Finding 7 — `evaluationOrder` hardcodes the model's projections

**Resolved** — commit `a93f176d9` (2026-08-04). Applied as proposed — leading scopes derived from `staticReadSet(definition)`, the single `this.decisionModel(target)` call hoisted, and the ORDER-BY doc comment restored verbatim — plus the projection-order test with an auth-first stub model in `reevaluation-order.test.ts`; the only deviation is the stub is typed `DecisionModel<AuthDecisionModel>` rather than a bare literal, because excess-property checks reject an `auth` projection on a fresh `DecisionModel<DocumentDecisionModel>` literal.

**Severity: nit.** `packages/reactor/src/executor/simple-job-executor.ts:1008`.

The pass's visit order is a literal list of the two models' projection scopes:

```ts
    const leading = ["document", "auth"].filter((scope) =>
      evaluated.includes(scope),
    );
```

The information is already available, already in the right order, and already
imported in this file: `staticReadSet` iterates
`Object.entries(definition.projections)`, so it yields `document` then `auth` for
`authDecisionModel` by declaration order. The executor calls it 80 lines further
down, in `reevaluateIfNeeded`'s `inReadSet` check. Deriving the order means a
third projection needs no executor change, and it removes the only place the
executor names a scope a model owns.

Note also that the explanatory comment this function used to carry — the one
recording that the revisions map has no `ORDER BY`, so the visit order is
load-bearing — has been trimmed away. It is worth keeping in some form: it is the
only statement of *why* the function exists at all.

### Proposed implementation

```ts
// packages/reactor/src/executor/simple-job-executor.ts

  /**
   * The scopes a re-evaluation pass visits, in a fixed order.
   *
   * The revisions map comes from a query with no ORDER BY, and the order is
   * load-bearing: each scope's pass re-reads the auth stream, and the walk skips
   * an operation by its stored denial, so a denial this pass just wrote is
   * visible to a later-visited scope and invisible to an earlier one. The model's
   * own projection order leads, then the rest sorted, so the pass is reproducible
   * across replicas and across runs.
   */
  private evaluationOrder(
    target: { documentId: string; branch: string },
    revision: Record<string, number>,
  ): string[] {
    const definition = this.decisionModel(target);

    const evaluated = Object.keys(revision).filter((scope) =>
      definition.evaluatesScope(scope),
    );

    const leading: string[] = [];
    for (const stream of staticReadSet(definition)) {
      const scope = stream.query.scope;
      if (evaluated.includes(scope) && !leading.includes(scope)) {
        leading.push(scope);
      }
    }

    const rest = evaluated
      .filter((scope) => !leading.includes(scope))
      .sort((a, b) => a.localeCompare(b));

    return [...leading, ...rest];
  }
```

This also drops one redundant `this.decisionModel(target)` call per filtered
scope: the current code rebuilds the definition inside the `filter` callback.

Test: extend `test/decision/reevaluation-order.test.ts` with an assertion that
the order follows the model rather than a literal — a `RegisteredDecisionModel`
stub declaring its projections `auth` first, asserted to be visited in that
order. That is cheaper now than it was under the old class hierarchy: the model
is just a function returning a `DecisionModel`, so the stub is an object literal.

**Effort:** trivial. **Risk:** none — the derived order is identical for both
models that exist today.

---

## Design notes

**Resolved** — commit `81d2c1b30` (2026-08-04). The decided items landed: the single-pass/convergence paragraph added to the spec's Re-evaluation section (plain paragraph, matching the surrounding voice), the appendCondition-discard comment at the `decideAtHead` call in `refuseIfPolicyDenies`, and `minIncomingTimestamp`'s string `<` converted to `Date.parse`; no deviations.

**Open items** — decided 2026-08-04: (a) the unsigned-document grant rule is **Resolved** — commit `ffc0a3d40`; no version machinery, since nothing has shipped the rule is simply part of the v1 policy from day one. `AuthAdministrationLockoutError` rejects any transition that removes (or downgrades via `SET_GRANT` upsert, which replaces in place) the last grant permitting `execute` on `auth` from a creator-less policy; commit `13a32f911` guards the same invariant at `INITIALIZE_AUTH` genesis with `AuthAdministrationMissingError`. (b) the `evaluatePositioned` `deletedAtUtcIso` message improvement is **Closed** — accepted as-is by decision, no code change.

These are not defects. They are places where the code is doing something
deliberate that the spec should say out loud, or where a reader will otherwise
reconstruct the wrong invariant.

### Re-evaluation is a single pass, not a fixed point

`reevaluateDocument` visits each evaluated scope once, in `evaluationOrder`.
A denial written to the auth stream during the `auth` pass changes the policy at
positions the `document` pass has already consumed, and the `document` pass is
not revisited.

This is deterministic, so replicas still agree with each other — which is the
property that matters for convergence. It does not mean the stored verdicts are
the fixed point of the policy. The `evaluationOrder` comment explains
determinism and can be read as claiming more than that.

**Proposed change:** state the guarantee in `docs/specs/auth-scope.md`, in the
re-evaluation section, next to the existing text about re-appends travelling:

> A pass visits each evaluated scope once, in the model's projection order. A
> verdict a pass writes is therefore visible to a later-visited scope and not to
> an earlier one. The pass is deterministic, so every replica computes the same
> verdicts from the same history; it is not iterated to a fixed point, so a
> verdict that would change under the state a later scope produced stands until
> the next arrival triggers another pass. Convergence between replicas is the
> guarantee; a fixed point is not.

If a fixed point *is* wanted, the change is to loop `evaluationOrder` until a
pass writes nothing, with a bound — but that is a design decision, not a fix,
and it costs a full re-read per iteration.

### `refuseIfPolicyDenies` discards the append condition

`AdmissionDecision` carries `appendCondition`, and the document-scope gate uses
only `evaluation`. A document-scope write that passes the gate is therefore not
append-conditioned on the auth head it was decided against.

This appears to be sound: position semantics mean a *later*-timestamped auth
operation cannot retroactively deny an earlier write, and a *backdated* one
triggers `reevaluateIfNeeded` (which fires precisely when
`some(op.timestampUtcMs < revisions.latestTimestamp)`), so the repair path
exists. Worth a comment at the call site saying so, because the asymmetry with
`processWrite` — which does thread `appendCondition` through — reads like an
oversight.

### Minor cosmetics

- `evaluatePositioned` calls `refusalError(reason, job.documentId, null, …)`, so
  a `DocumentDeletedError` raised from the positional path loses the
  `deletedAtUtcIso` the head path supplies. Threading
  `model.document.deletedAtUtcIso` out of `evaluateByPosition` would need an API
  change for a message-only improvement; alternatively drop the parameter and
  let the error say only that the document is deleted.
- Pre-existing and untouched: `minIncomingTimestamp` in the load path
  (`simple-job-executor.ts:1276`) still selects a minimum with string `<`, while
  every new comparison in this change uses `Date.parse`. Mixed precision inverts
  lexically — `"…:00Z"` sorts after `"…:00.500Z"` because `Z` is `0x5A` and `.`
  is `0x2E`, though it is the earlier instant — but here the only consequence is
  a wider conflicting window, so it is conservative rather than wrong. It is the
  last string timestamp comparison left in the file and worth converting for
  consistency.

---

## Other observations

### Security

Fail-closed defaults look right:

- default-deny once a policy exists;
- the creator carve-out is checked **before** the version gate, so an unknown
  policy version cannot brick its own administration;
- `filterReadableScopes` applied at the client boundary rather than in read
  models, with the reasoning stated (internal consumers must keep seeing
  everything);
- slug resolution is never relaxed for a deleted document, so boundary state is
  reachable only by an id the caller already holds.

The spec addition about an unsigned document permanently locking its own auth
scope documents a real hazard but does not prevent it. Worth a follow-up:
validate in `applyRemoveGrantAction` (or `assertValidGrantUpsert`) that a
creator-less document retains at least one grant permitting `execute` on `auth`,
and reject the removal otherwise. That is a policy-level rule, so it needs a
version bump if it is to be enforced uniformly across replicas — which is
exactly why it should be decided before `authEnforcement` defaults on rather
than after.

**Resolved** — commit `ffc0a3d40` (2026-08-04). Enforced on both mutation paths
(`applyRemoveGrantAction` and the `SET_GRANT` upsert, which can downgrade in
place) with `AuthAdministrationLockoutError`; no version bump, per the decision
that nothing has shipped, so the rule is part of v1 from day one. Deny grants,
`where`-conditioned grants, and group/match principals do not count as retained
administration (v1 never applies them). Genesis (`INITIALIZE_AUTH` creating a
creator-less policy with zero admin grants) is guarded by commit `13a32f911`
with `AuthAdministrationMissingError` — born-locked-out is rejected the same
way as locking out by removal.

### Performance

`evaluateByPosition` re-reads each read-set stream per evaluated scope, and
`reevaluateDocument` loops scopes, so a document with N evaluated scopes issues
N × streams indexed queries per triggering write. The `decidingActions`
narrowing keeps the result sets small, and the early return when every read
stream is empty covers the common case. Acceptable now; this is the thing to
measure when a third projection lands.

### Test coverage

+3370 test lines, hitting the right seams — `auth-projection`, `auth-monotonic`,
`reevaluation-order`, `reshuffle-guard`, `failure-classification`, dead-letter
rehydration, and the walk's verdict feedback. The two gaps are the ones above:
no versioned-replay denial test (finding 1) and no equal-timestamp case for
`firstOutOfOrderPair` (finding 2).

### Migration

Migration 016 is additive, `notNull().defaultTo("UNCLASSIFIED")`, and coalesced
on read — correct on both sides. GraphQL `errorType` and `deniedReason` are
nullable, and `serializeEnvelope` omits `deniedReason` when undefined, so a peer
on the older schema is unaffected. `normalizeAbsentFields` deleting the key
rather than assigning `undefined` is the right call given that `isDenied` and
`operationOutcome` test strictly against `undefined`.

---

## Suggested order of work

| # | Item | Effort | Blocking? |
| --- | --- | --- | --- |
| 1 | Finding 1 — versioned replay append | small | **done** — commit `e8186ff83` |
| 2 | Finding 2 — strict pre-flight (`requireStrict`) | small | **done** — commit `d62e23450` |
| 3 | Finding 3 — pre-flight CLI | small | **done** — commit `64d9c3408` |
| 4 | Finding 4 — flag guard | trivial | **done** — commit `408d0320a` |
| 5 | Finding 5 — typed timestamp error | small | **done** — commit `33cd95642` |
| 6 | Finding 7 — derive `evaluationOrder` | trivial | **done** — commit `a93f176d9` |
| 7 | Design notes — spec wording, unsigned-document grant rule | small / discuss | **done** — commit `81d2c1b30`; grant rule landed in `ffc0a3d40`, `deletedAtUtcIso` closed as accepted-as-is |

Finding 6 (action-list duplication) is already applied. Findings 2 and 3 are one
piece of work in practice — the strictness fix is only useful once something runs
it, so pairing them is what makes "enable `authEnforcement` on this fleet" a
verifiable step.
