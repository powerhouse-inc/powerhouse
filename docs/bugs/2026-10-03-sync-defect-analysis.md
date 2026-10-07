# Root-cause analysis: the four sync/storage defects of 2026-10-03

**Scope:** analysis and repro only. No source file was changed. Fixes are separate
reviewed work packages; proposals and their blast radius are at the end of each
section.

**Inputs:** `docs/bugs/2026-10-03-pglite-aborted-transaction-bricks-worker-reactor.md`
(the live capture, both addenda), `docs/plans/2026-10-03-multi-reactor.md`
(work-package map, standing backlog item 9).

**Repro tests:** `packages/reactor/test/bugs/2026-10-03-*.test.ts`, 19 tests in
four `describe.skip` blocks. Every one asserts the CORRECT behaviour and fails
when unskipped; CI stays green while they are skipped. Verified:
`pnpm vitest run --project reactor test/bugs/` -> 19 skipped; with
`describe.skip` -> `describe`, 19 failed, 0 passed.

**Empirical method.** Everything labelled "proven" below was executed against a
real PGlite 0.3.15 + `kysely-pglite-dialect@1.2.0` + Kysely, in this checkout.
Line references are to the code as of `620b62721e` on `feat/multi-reactor`.

---

## The dependency between the four mechanisms

```
                 wasm-level fault in _interactive_one           store.ts:139
                 (OOM / IDBFS ErrnoError) mid-Execute           base-handle query
                              |                                 inside open trx
                              v                                        |
                   unnamed portal left PORTAL_ACTIVE                   v
                              |                               driver lease parked
                              v                               forever; no COMMIT,
                  ROLLBACK fails: "cannot drop active                no ROLLBACK
                  portal \"\"" -> Kysely releases anyway                |
                              |                                        |
                              +------------------+---------------------+
                                                 v
                                   (A) session poisoned: open,
                                   aborted transaction, no reset
                                   on release, beginTransaction
                                   now fails so Kysely never
                                   even attempts a rollback
                                                 |
                      +--------------------------+--------------------------+
                      v                                                     v
        COMMIT on an aborted transaction                      reads serve uncommitted
        silently answers ROLLBACK ->                          state (addendum 1a)
        job reports COMPLETED, nothing written
                      |
                      v
        (B) inbox cursor advances past data                    restart rolls back
        that does not exist; polls say "caught up"             (addendum 1b)
                      |
                      v
        (D) next op for a rolled-back document                 (C) the loop that
        hits DocumentNotFoundError -> UNCLASSIFIED             would repair it is
        -> PERMANENT quarantine                                dead and reports
                                                               "connected"
```

(A) is the only one that needs an external fault. (B), (C) and (D) are each
independently reachable and each independently turns a transient fault into a
permanent one. That is why the drive never recovered.

---

## Mechanism A — transaction poisoning with a stuck portal

### What the two observed error strings jointly prove

The live session reported BOTH:

- every ordinary statement: `current transaction is aborted, commands ignored
  until end of transaction block`
- `ROLLBACK` specifically: `cannot drop active portal ""`

Exactly one session state produces that pair, and the asymmetry is the proof.
Postgres rejects messages in aborted-transaction state at the top of the
per-message dispatch in `PostgresMain`, **before** `exec_bind_message` runs --
so an ordinary statement never reaches the portal and reports the abort.
`ROLLBACK` is a transaction-ending command and is exempt from that check, so it
*does* reach `exec_bind_message`, which must first drop the existing unnamed
portal and raises `cannot drop active portal "<name>"` from `PortalDrop` when
that portal's status is `PORTAL_ACTIVE`.

So: **the transaction was aborted AND the unnamed portal was stuck ACTIVE.**
`ROLLBACK` is the only statement that could reveal the second half. And because
every statement PGlite sends -- `ROLLBACK` included -- goes through the extended
protocol and binds the unnamed portal (PGlite `#runQuery`: Parse, Describe(S),
Bind, Describe(P), Execute, Sync -- `@electric-sql/pglite` `src/base.ts:230-305`),
no SQL could ever clear it. That is precisely why only a worker restart worked.

### Ruled out

| Hypothesis | Verdict | Why |
|---|---|---|
| Abandoned Kysely `.stream()` leaving a portal | **Ruled out** | `packages/reactor/src` contains no `.stream()` / `streamQuery` call at all, and `kysely-pglite-dialect`'s `streamQuery` materialises the whole result with one `client.query()` and slices in JS -- it never opens a portal. Its failure signature is also wrong: a dropped iterator never releases the driver lease, so statements **hang**, they do not error. Proven (test: "does not deadlock the driver when a stream iterator is abandoned" -> `hung`). |
| `PortalSuspended` from a row-limited `Execute` | **Ruled out** | PGlite's serialiser emits `execute({})` as a constant with `maxRows = 0`; no suspension is ever produced by this stack. |
| Unawaited keyframe write racing COMMIT/ROLLBACK | **Not the poisoner** | `KyselyWriteCache.persistKeyframe` (`src/cache/kysely-write-cache.ts:517-540`) fires `keyframeStore.putKeyframe(...)` without awaiting, and inside a job it writes through the job's `trx` (`src/storage/kysely/keyframe-store.ts:59-63`). Probed: PGlite's per-statement `#queryMutex` serialises it, so the orphan statement always completes before COMMIT and no desync or surviving-write occurs. It is still defective -- see A-5. |
| A second Kysely over the reactor's PGlite inside the worker | **Ruled out for the worker** | `apps/connect/src/reactor.worker.ts` builds exactly one Kysely over `owned.reactorPg` (`:442`); the relational store is a separate PGlite instance/IDB namespace (`:266-277`). |
| `packages/pglite-fs` raw `execProtocol` maintenance | **Ruled out for this repro** | `AtomicNodeFs` (`packages/pglite-fs/src/atomic-node-fs.ts:242-298`) does speak raw protocol bytes below PGlite's `#transactionMutex`, which is a genuine desync source -- but it is the Node FS. The live repro was browser `idb://`. Relevant to switchboard, not here. |

### Culprits, ranked

#### A-1 — `store.ts:139` queries the base handle inside an open transaction. CERTAIN.

`packages/reactor/src/storage/kysely/store.ts:70-96` catches
`_UniqueConstraintContext` **inside** the job's transaction -- by which point the
unique-constraint violation has already aborted the PG transaction -- and then
calls `resolveUniqueConstraint`, which runs its recovery query against
`this.db`, the base handle, not the open `trx`:

```ts
// store.ts:133-150
private async resolveUniqueConstraint(ctx: _UniqueConstraintContext) {
  try {
    replayOps = await this.findIdempotentReplay(
      this.db,            // <-- BASE handle while this.trx is open
      ...
  } catch {
    // Lookup failed; propagate original error below
  }
```

On single-connection PGlite, `PGliteDriver.acquireConnection` parks that call on
its in-memory `queue` because the transaction holds the only lease, and the
transaction is awaiting the parked call. **Permanent deadlock.** Kysely issues
neither COMMIT nor ROLLBACK, so the session is left in an open, ABORTED
transaction with the lease held forever. The bare `catch {}` cannot help: a
deadlock does not throw.

`SimpleJobExecutorManager` then abandons the job after `jobTimeoutMs` (30_000)
via `Promise.race` against `AbortSignal.timeout`
(`src/executor/simple-job-executor-manager.ts:186-205`) and frees its slot --
which is exactly why the live queue read
`{isPaused:false, pendingJobs:[], executingJobs:[]}` while storage was dead.

Proven deterministically: test *"does not deadlock when a recovery path queries
the base handle"* -> `hung`, and `pg.isInTransaction()` stays `true`.
Corroborated in-tree by `src/read-models/base-read-model.ts:220`, whose comment
already warns "A locked commit through this.db deadlocks single-connection
PGlite", and by the constructor guard at `:221-233` that exists to stop
subclasses doing it.

The sibling path at `store.ts:100-130` (no ambient `trx`) is safe: Kysely has
already rolled back and released before `resolveUniqueConstraint` runs.

**Explains:** the open aborted transaction, the empty/unpaused queue, raw
inspector statements erroring. **Does not explain:** the active portal.
**Signature:** Kysely statements *hang*; only out-of-queue statements error.

#### A-2 — a wasm-level fault leaves the portal ACTIVE and the reactor makes it permanent. HIGH (state proven, trigger inferred).

Since PGlite never suspends a portal and `execProtocolRawSync` is fully
synchronous (`mod._interactive_one`, `src/pglite.ts:658-679`), an ACTIVE unnamed
portal can only arise from `PortalRun` never returning -- i.e. a JS/wasm-level
throw out of `_interactive_one` (Emscripten `ErrnoError` from the IDBFS layer, or
an OOM / memory-growth failure) mid-Execute. PGlite's `#runQuery` rewraps only
`DatabaseError`, rethrows anything else, and its `finally` sends `Sync` anyway.
`relaxedDurability: true` -- which the worker sets (`reactor.worker.ts:241`) --
makes `syncToFs` fire-and-forget (`src/pglite.ts:835-848`), so IDB writes run
concurrently with later message processing, widening that window under exactly
the load profile of a 16k-envelope backfill.

The reactor cannot prevent that fault. What it does is convert it into a
permanent brick, through four amplifiers that are all certain and three of which
are unit-proven:

1. **A failed ROLLBACK is released anyway, and replaces the original error.**
   Kysely's transaction body (`node_modules/kysely/dist/esm/kysely.js:568-582`)
   awaits `rollbackTransaction` in its `catch` with no retry and rethrows
   whatever that raises; `DefaultConnectionProvider.provideConnection` releases
   in a `finally` regardless. Proven: test *"does not release a connection whose
   rollback failed"* -> the job's own `JOB-FAILED` is replaced by
   `cannot drop active portal ""`, and `pg.isInTransaction()` stays `true` after
   release. The real cause is therefore invisible in the logs, which is why the
   worker was silent.
2. **Once poisoned, Kysely never even attempts a rollback.** `beginTransaction`
   becomes the statement that fails, so `transactionBegun` stays false and the
   `if (transactionBegun)` guard skips the rollback. The state is
   self-perpetuating by construction. Proven: test *"recovers a session left in
   an aborted transaction"*.
3. **`PGliteDriver.releaseConnection` resets nothing** -- no ROLLBACK, no
   `DISCARD ALL`, no transaction-status probe. The same `PGliteConnection`
   object, and therefore the same PG session, is handed to the next waiter.
4. **Nothing anywhere probes DB health.** All four channels reported
   `connected`, `failureCount: 0` throughout.

**Explains:** all four live observations, including both error strings and
errors-rather-than-hangs.

#### A-3 — raw `pg.query` bypasses the dialect queue entirely. CERTAIN mechanism, contributory in the live session.

`apps/connect/src/reactor.worker.ts:141-150`:

```ts
const inspectorDb: IReactorDbQuery = {
  queryDb: async (sql, params) => {
    const result = await owned.reactorPg.query(sql, params);
```

`owned.reactorPg` is the very PGlite the reactor's Kysely wraps. The dialect
opens a transaction with a bare `client.query("begin")`, and PGlite releases its
`#transactionMutex` at the end of **every** statement -- so a Kysely
`BEGIN..COMMIT` has no protection from PGlite at all; the only thing making it
atomic is the dialect's own JS queue, which `pg.query` does not enter.

Proven: test *"does not let a non-Kysely statement execute inside a Kysely
transaction"* -- the raw query reads the reactor's uncommitted row. And test
*"fails the transaction when an outside statement aborted it"* -- one erroring
raw statement aborts the reactor's open transaction, whose COMMIT then silently
answers ROLLBACK, so `transaction().execute()` **resolves** with the callback's
value and the row is gone. That is the engine of mechanism B.

Same bypass in `packages/reactor-monitor/src/build-reactor.ts:140-145`, and the
Connect DB explorer builds a **second** `Kysely` with its own independent queue
over the same session (`apps/connect/src/components/modal/modals/InspectorModal/useDbExplorer.ts:93-104`),
quiescing only for export/import. The operator was using inspector RPC and the
DB explorer throughout the live session, so any erroring statement typed there
(a typo, a missing table) would have aborted whatever job transaction was open.

#### A-4 — abandoned `.stream()`. LATENT ONLY. Ruled out as the live cause (see table). Worth a lint ban.

#### A-5 — unawaited keyframe write. LATENT ONLY.

Not the poisoner (probed), but still wrong: the error is swallowed by
`.catch(console.error)`, and a job whose transaction rolls back silently drops
the keyframe with no retry and no record. Unscoped calls open their own
fire-and-forget `this.db.transaction()` (`keyframe-store.ts:63`) that pile up on
the driver queue and are abandoned on `destroy()`.

### The one discriminator the next repro must capture

A-1 and A-2 differ in one directly observable way: **under A-1 reads through the
reactor HANG; under A-2 they ERROR.** The live capture records `client.get(...)`
*erroring*, which favours A-2, but the capture does not distinguish an error from
an RPC timeout rendered as an error. Next soak: time a `client.get` and an
inspector `queryReactorDb('SELECT 1')` side by side the moment the brick
appears. A hang on the first and an error on the second is A-1; errors on both is
A-2.

### Fix proposal (smallest correct first)

| # | Fix | Blast radius | Work package |
|---|---|---|---|
| 1 | `store.ts`: give `resolveUniqueConstraint` the executor it must use (carry it on `_UniqueConstraintContext`, or pass `this.queryExecutor`). ~5 lines. | One method in one file. Needs a duplicate-operation regression test. | Backlog 9 (plan `docs/plans/2026-10-03-multi-reactor.md:151`) |
| 2 | Wrap/fork `PGliteDialect`: on `releaseConnection`, probe `ReadyForQuery`; if not `'I'`, issue `ROLLBACK` (via `pg.exec`, and a portal `Close` first) before handing the session on; mark the connection dead if that fails. Add an `acquireConnection` timeout so a parked waiter throws instead of hanging. | A new wrapper in `packages/reactor`; every PGlite-backed consumer (reactor, monitor, switchboard dev). Highest value per line. | Backlog 9 / new W0.7 |
| 3 | Route every inspector/monitor `queryDb` through the reactor's Kysely instead of `pg.query`; make the DB explorer reuse that one handle. | 3 call sites (`reactor.worker.ts:146`, `reactor-monitor/src/build-reactor.ts:142`, `useDbExplorer.ts:101`); loses the ability to inspect *while* wedged, so pair with (2). | W0.3 (`db.query` capability) |
| 4 | Storage watchdog: cheap `SELECT 1` probe + error classification; on an aborted/portal state attempt recovery, escalate to a controlled component restart, and emit an event either way. Surface a DB-health dimension so connection state cannot read green while storage is dead. | New component plus an inspector op; no existing behaviour changed. | W0.5 (sync observability) + follow-up 2/3 of the original bug doc |
| 5 | Do not abandon a job mid-transaction: on `jobTimeoutMs`, still await the executor promise (bounded) before releasing the slot, or treat "lease held with no executing job" as a fatal storage-health event. | `simple-job-executor-manager.ts`; changes timeout semantics, so it needs its own review. | Backlog 9 |
| 6 | Lint bans: `.stream()`; `this.db` reachable from a `trx`-scoped store; unawaited DB promises (starting `kysely-write-cache.ts:528`, `processor-manager.ts:700`). | Repo-wide lint; will surface existing violations. | Hygiene, any stage |

### Does A compile with the live profile?

Yes, on every axis.

- **~16k envelope backfill.** Sustains the widest possible window of open write
  transactions, and drives the largest JSONB payloads through the wasm heap --
  the OOM / IDBFS-error surface A-2 needs.
- **Writes every ~65s, reads every ~65s.** Guarantees that a read (or an
  inspector statement) regularly coincides with an open write transaction. A-3
  needs exactly that coincidence; mechanism B needs it too.
- **PGlite in a SharedWorker on `idb://`, `relaxedDurability: true`.** Makes
  `syncToFs` fire-and-forget and concurrent with subsequent message processing,
  and puts an IndexedDB layer -- the one that raises Emscripten `ErrnoError` --
  under heavy write pressure. Memory is also bounded by the worker, not the tab.
- **Worker pool NOT used.** So there is genuinely one PGlite session for reads,
  writes, sync ingestion and read models. Nothing isolates any of them.
- **Keyframes/snapshots at reactor defaults (`keyframeInterval: 10`).** Roughly
  one keyframe write per 10 revisions -- ~37 on the Accounts drive document alone
  during catch-up, each an unawaited 3-statement write inside a job transaction
  (A-5), each a large JSONB document.
- **~6 minutes to failure, load-dependent.** Consistent with a fault whose
  probability scales with transaction count and payload size, and with A-1,
  which needs one unique-constraint violation -- a routine event during bulk
  re-ingestion of overlapping operations.

### What cannot be unit-tested

The initiating `PORTAL_ACTIVE` state. It requires a throw out of
`mod._interactive_one` mid-`PortalRun`, which from JS is unreachable:
`execProtocolRawSync` is synchronous, so the Execute cannot be abandoned, and
PGlite never row-limits it. Reproducing it faithfully needs PGlite-level fault
injection (a patched `postgresMod` whose `_interactive_one` throws on the Nth
Execute) or a wasm memory cap. The closest harness in the suite is *"does not
release a connection whose rollback failed"*, which simulates the portal at the
client boundary and still proves the three reactor-side amplifiers for real. Fix
(2) is validated by that harness; fix (1) by a real deterministic deadlock.

---

## Mechanism B — cursor ahead of durable data

### Causal chain

1. `KyselyExecutionScope.run` wraps the whole job in `db.transaction()`
   (`src/executor/execution-scope.ts:94`).
2. `SimpleJobExecutor.executeJob` returns the result only after that callback
   resolves (`src/executor/simple-job-executor.ts:392-446`), so in the normal
   case job completion *is* after COMMIT. **The ordering is correct until the
   COMMIT lies.**
3. **COMMIT on an aborted transaction answers `ROLLBACK` and does not error.**
   Kysely never inspects the command tag, so `transaction().execute()` resolves
   with the callback's return value while nothing was written. Proven: tests
   *"fails the transaction when its COMMIT silently degraded to a ROLLBACK"* and
   *"fails the transaction when an outside statement aborted it"* -- both see
   `rows == []` and a resolved transaction.
4. `SyncManager` awaits the job (`src/sync/sync-manager.ts:2255`), sees
   `status !== FAILED`, calls `syncOp.executed()` (`:2281`) -- which advances the
   mailbox `_ack` via the status listener in `Mailbox.add`
   (`src/sync/mailbox.ts:136-144`) -- then `inbox.remove(syncOp)` (`:2300`).
5. `Mailbox.remove` fires the channel's `onRemoved` hook synchronously
   (`src/sync/channels/gql-req-channel.ts:286-303`), which reads
   `this.inbox.ackOrdinal` and calls `cursorStorage.upsert(...)` as a
   **fire-and-forget promise with a `.catch(log)`**.

So the cursor write is a separate autocommit statement on a separate Kysely
acquisition, with **no handshake of any kind** to the job's durability: the
channel is never told whether the ops committed, and nothing re-reads them. Any
transaction whose COMMIT silently degraded therefore commits its cursor and
loses its data -- which is also the whole of addendum 1 ("33 revisions
'ingested' but never durably committed, yet reads served them as current
state"): the write cache is shared with the scoped copies, so a rolled-back
job's writes sit in it until eviction (the executor's own doc comment at
`simple-job-executor.ts:370-378` admits this window).

### Why a SQL cursor rewind has no runtime effect

`init()` is the **only** reader of cursor storage
(`gql-req-channel.ts:462-482`): it lists the rows once, seeds
`inbox.init(inboxOrdinal)` and `lastPersistedInboxOrdinal`, and from then on
`poll()` sends the in-memory `this.inbox.ackOrdinal` as the `outboxAck` variable
(`:508-512`; "outbox" is the remote's view of our inbox). Nothing re-reads
storage. Worse, `lastPersistedInboxOrdinal` guarantees a *lowered* row is never
honoured: the guard is `maxOrdinal > this.lastPersistedInboxOrdinal`, so the next
advance simply overwrites the rewind. Channel init -- i.e. a worker restart -- is
the only thing that reads it. Proven: test *"honours a cursor rewound in storage
without a restart"* -> still polls from 9770.

A second defect in the same hook: `lastPersistedInboxOrdinal` is assigned
*before* the upsert is awaited and is never rolled back on rejection, so a failed
cursor write is never retried. Proven: test *"retries an inbox cursor write that
failed"* -> 1 call where 2 are required. (For the inbox the failure direction is
benign -- a stale cursor re-pulls. For the outbox the same code resends
duplicates, which its own log message admits.)

### Confidence

**Certain** for the ordering, the fire-and-forget write, the absent durability
handshake and the dead rewind lever -- all read directly off the source and three
of the four reproduced. **Certain** for the COMMIT-lies step, proven against real
PGlite. The only inference is which specific transaction was poisoned in the live
session, which is mechanism A's question, not B's.

### Fix proposal

| # | Fix | Blast radius | Work package |
|---|---|---|---|
| 1 | Make the cursor advance conditional on durability. Smallest correct form: have the executor report durability explicitly (it already distinguishes `JobRollbackSignal`) and have `SyncManager` withhold `syncOp.executed()` / `inbox.remove` until then; secondarily, verify the COMMIT tag in the dialect wrapper from A-fix (2) so a degraded COMMIT throws. | Fixing the dialect alone fixes B's live instance with no sync changes -- do that first. The sync-side gate touches the hot ingestion path and needs load testing. | Backlog 9, then a new W0.7 |
| 2 | Write the inbox cursor inside the job's own transaction (true atomicity). | Couples sync storage to executor transactions; the cleanest guarantee and the biggest change. Defer behind (1). | New W0.7 |
| 3 | Do not advance `lastPersisted*Ordinal` until the upsert resolves; restore it on rejection. ~4 lines, two hooks. | `gql-req-channel.ts` only. | W0.5-adjacent |
| 4 | Add a rewind lever: `IChannel.rewindInboxCursor(ordinal)` that resets `inbox.init`, `lastPersistedInboxOrdinal` and storage together, exposed as an inspector op. | New API surface; the operator's manual playbook (SQL rewind + `adminClient.restart()`) becomes a supported one-click repair. | W0.5 (inspector repair levers, defect (e) of the bug doc) |

---

## Mechanism C — silently dead poll loop reporting "connected"

Four independent defects produce the observed
`state: "connected", lastSuccessUtcMs: 0, lastFailureUtcMs: 0`. All are
code-proven.

### C-1 — "connected" is declared by starting a timer. CERTAIN.

`gql-req-channel.ts:462-482`:

```ts
this.pollTimer.setDelegate(() => this.poll());
this.pollTimer.start();
this.transitionConnectionState("connected");   // :481
```

"Connected" means no more than "a timer object was started". `lastSuccessUtcMs`
stays `undefined` and `getConnectionState()` renders it as `0` (`:331`), which is
indistinguishable from "succeeded at the epoch". `recoverFromChannelNotFound`
does the same on a successful touch (`:749`), again with no completed poll. So
the snapshot was not merely wrong, it was **unfalsifiable** -- there is no value
of the `state` field that could have revealed the dead loop.

Proven: test *"does not report connected before a poll has ever completed"*.
Note this contradicts the currently-codified expectation in
`test/sync/channels/gql-req-channel/connection-state.test.ts` ("transitions to
connected after init"), which encodes the defect; whichever fix lands must update
it.

### C-2 — post-fetch exceptions escape `poll()` unclassified. CERTAIN.

`poll()` routes errors through `handlePollError` only around the
`pollSyncEnvelopes` call (`:518-525`). Anything thrown **after** the fetch --
`consolidateSyncOperations`, `inbox.add` (which rethrows listener failures as
`MailboxAggregateError`, `mailbox.ts:155-161`), `handleRemoteDeadLetters` --
escapes with `failureCount` unincremented, `lastFailureUtcMs` unset and no state
transition. `IntervalPollTimer.tick` catches it (`interval-poll-timer.ts:99-102`)
and retries with backoff capped at `retryMaxDelayMs` (300_000 by default), so
after ~9 consecutive failures the channel retries **once every five minutes**
while reporting `connected / 0 / 0`. That is the live snapshot with a loop that
is alive but useless.

Proven: test *"records a failure when poll() throws after the fetch"*.

### C-3 — no request timeout anywhere; a hung fetch kills the loop for good. CERTAIN.

`executeGraphQL` passes `signal: this.abortController.signal` (`:1413`), and that
controller is aborted **only** by `shutdown()` (`:316`). There is no
`AbortSignal.timeout`, no race, and no bound on `await response.json()` either.
`IntervalPollTimer` schedules the next tick exclusively from the delegate's
`.then`/`.catch` (`interval-poll-timer.ts:94-102`), so a delegate that never
settles leaves `this.timer` undefined with nothing pending: the loop is dead
forever, silently, with no failure recorded and nothing to revive it but an
external `triggerNow()`.

A cursor-0 re-pull asking the server for ~16k envelopes in one response is a very
plausible way to get there. Two aggravating details on that path: the server
response is unbounded apart from the `hasMore` flag the resolver chooses, and
`executeGraphQL` eagerly evaluates `JSON.stringify(result.data)` for its
`logger.verbose` call (`:1452-1459`) **regardless of log level** -- a full second
serialisation of the entire payload on the worker thread for every poll.

Proven: tests *"times out a hung poll request and keeps the loop alive"*,
*"keeps ticking when the delegate never settles"*.

The same hole exists one level down: `queue.totalSize()` is awaited with no
timeout (`interval-poll-timer.ts:87-88`), so a queue whose size probe hangs --
which is exactly what mechanism A's held driver lease does to anything that reads
the DB -- kills the loop identically. Proven: test *"keeps ticking when the queue
size probe never settles"*. **This is the direct bridge from A to C.**

### C-4 — silent early returns count as success. CERTAIN.

`if (!(await this.refreshManifestsIfStale(...))) return;` (`:548-555`).
`refreshManifestsIfStale` logs and returns `false` when the manifest refresh
throws (`:570-578`). That `return` reaches neither the `lastSuccessUtcMs` /
`failureCount = 0` at the end of `poll()` nor `handlePollError`, so the delegate
**resolves**: the timer treats it as a success, resets `consecutiveFailures` and
reschedules at the normal interval. A peer whose manifest cannot be refreshed
polls forever, ingests nothing, and reports `connected / 0 / 0`.

Proven: test *"distinguishes a bailed poll from a successful one"*.

### Ruled out

- **Backpressure pause without resume.** `scheduleBackpressureRecheck` re-arms
  every `backpressureCheckIntervalMs` (500ms default) and `totalSize()` failures
  fail *open* to `scheduleNext` (`interval-poll-timer.ts:105-108`), so a draining
  queue does recover. `pause()` clears the timer and only `resume()`/`triggerNow()`
  restarts it, but nothing in `GqlRequestChannel` calls `pause()`. Not this.
- **`connectionState` initialising as "connected".** It initialises as
  `"connecting"` (`:177`). The unearned transition is C-1, not the initial value.
- **An escaped synchronous throw from the delegate killing the timer.** A
  synchronous throw inside `tick`'s `.then` becomes a rejection caught by the
  outer `.catch` -> `scheduleNext`. Handled.

### Fix proposal

| # | Fix | Blast radius | Work package |
|---|---|---|---|
| 1 | Report `"connected"` only once a poll has completed; add an explicit never-succeeded state (or let the UI key on `lastSuccessUtcMs === 0`). ~10 lines + update the existing connection-state test. | `gql-req-channel.ts` + one test file; every consumer of `ConnectionStateSnapshot` sees a new state value during startup. | W0.5 |
| 2 | Wrap the whole body of `poll()` so every failure lands in `handlePollError`. ~5 lines. | One method; changes which errors mark the channel `error`, so review the unrecoverable classification with it. | W0.5 |
| 3 | Give `executeGraphQL` a request timeout (`AbortSignal.any([this.abortController.signal, AbortSignal.timeout(ms)])`) with a configurable bound, and cap the poll page size. | `gql-req-channel.ts`; a too-tight timeout would thrash a slow server, so make it config with a generous default. | W0.5 |
| 4 | Supervise `IntervalPollTimer`: always have a next tick armed (a watchdog timer set *before* invoking the delegate, cleared on settle), and bound `queue.totalSize()`. | `interval-poll-timer.ts`; touches every channel's cadence -- needs its own tests for overlap, since `tick()` has no reentrancy guard today and `triggerNow()` can already run two delegates concurrently and orphan a timer. | W0.5 |
| 5 | Make the bailed-poll return paths record something (a `lastBailUtcMs`, or a failure). | `gql-req-channel.ts`. | W0.5 |
| 6 | Drop the eager `JSON.stringify` in the verbose log paths (make them lazy). ~2 lines, pure win. | None. | Hygiene |

---

## Mechanism D — UNCLASSIFIED dead-lettering of missing-ancestor ops

### Classification site

One table, `packages/reactor/src/sync/utils.ts:556-580`. It has no
`DocumentNotFoundError` case, so the `default:` branch (`:578-579`) returns
`UNCLASSIFIED`. The accessor is `syncOperationErrorType` (`:583-588`), and the
inbox path builds its `ChannelError` in `SyncManager.inboxFailure`
(`src/sync/sync-manager.ts:2305-2327`).

### How an inbound op for a rolled-back document gets there

1. The load job's write cache finds no op at `document` scope index -1 and throws
   `DocumentNotFoundError` (`src/cache/kysely-write-cache.ts:799-801`; its own
   comment says "the executor defers the job until the document arrives").
2. `job-result-handler.ts:148-167` **defers** rather than fails -- the one place
   the stack admits "the ancestor may still be in flight".
3. `deferred-jobs.ts` releases it only on a `CREATE_DOCUMENT` for that exact id;
   otherwise it expires after `DEFAULT_DEFERRED_JOB_TTL_MS = 30_000`
   (`src/executor/types.ts:167`) and is failed with a fresh
   `DocumentNotFoundError` (`deferred-jobs.ts:160`).
4. `inboxFailure` classifies by `error.name` -> `UNCLASSIFIED`, and flattens the
   typed error into `new Error("Failed to apply operations: ...")`, discarding the
   `documentId` that `ErrorInfo` had carried
   (`src/executor/job-result-handler.ts:57-63`).

### Worse than the bug doc recorded

`quarantinesDocument` (`utils.ts:601-605`) returns true for everything outside
`NON_QUARANTINING_ERROR_TYPES` (`:589-597`), so `UNCLASSIFIED` **quarantines**.
`SyncManager` adds the id to `quarantinedDocumentIds` (`:1524-1530`) and refuses
all further inbound ops for it (`:1834`). The only line that ever deletes from
that set is inside `tombstone()` (`:804`) -- a purge. The existing suite already
states it: `test/sync/failure-classification.test.ts:96-98`, "nothing ever clears
a quarantine".

So one rolled-back ancestor **permanently excommunicates a document from sync**,
and there is no lever to undo it. `ISyncDeadLetterStorage.remove` /
`removeByRemote` are never called from any `src/`; there is no `retryCount`,
`status`, `repairable` or `retryable` field anywhere on `DeadLetterRecord`, the
table or migration `016`; and a repo-wide search for
`requeueDeadLetter|retryDeadLetter|repairable|rewindCursor|resetChannel` finds
zero code.

### What a "repairable" classification would key on

Only `name` and `message` survive `inboxFailure`'s rewrap, so the key available
today is `errorName === "DocumentNotFoundError"` **minus** `DocumentPurgedError`
-- note `DocumentNotFoundError.isError` deliberately answers true for the purged
subclass (`src/shared/errors.ts:306-309`) because only the name crosses the
queue, so the two must be separated by name, not by `isError`. Purged is
terminal (`DOCUMENT_PURGED`, already non-quarantining); missing-ancestor is
repairable. A cleaner key would carry `ErrorInfo.documentId` through
`inboxFailure` so the repair knows *which* ancestor to backfill -- it is already
populated and merely dropped.

There is **no missing-ancestor or gap detection** in sync ingestion at all. The
substitutes are job dependency ordering (`sync-manager.ts:2177-2202` plus the
topological sort in `utils.ts:502-549`) and the 30s deferral window, which is an
implicit time-bounded bet with no record of what was missing. Three declared
`SyncOperationErrorType` members -- `LIBRARY_ERROR`, `MISSING_OPERATIONS`,
`GRACEFUL_ABORT` -- are never produced anywhere; `MISSING_OPERATIONS` is the
natural name for this case and is already in the union and the GraphQL contract.

Proven: tests *"classifies a missing ancestor as something other than
UNCLASSIFIED"*, *"does not quarantine a document for a missing ancestor"*,
*"classifies the ChannelError the inbox path builds"*.

### Confidence

**Certain.** Every step is a direct source read and the classification and
quarantine behaviour are reproduced as pure-function tests.

### Fix proposal

| # | Fix | Blast radius | Work package |
|---|---|---|---|
| 1 | Add a `case "DocumentNotFoundError": return "MISSING_OPERATIONS"` to `classifyJobFailure` and put `MISSING_OPERATIONS` in `NON_QUARANTINING_ERROR_TYPES`. ~3 lines. Stops the permanent quarantine immediately and uses a member the union and GraphQL schema already carry. | `utils.ts`; update `test/sync/failure-classification.test.ts`'s exhaustiveness loop. Changes which documents quarantine -- the point. | New backlog item; W0.5-adjacent |
| 2 | Carry `ErrorInfo.documentId` through `inboxFailure` into the dead letter so a repair knows what to backfill. | `sync-manager.ts` + `DeadLetterRecord`/migration if persisted. | Same |
| 3 | A repair path: on a `MISSING_OPERATIONS` dead letter, rewind the inbox cursor below the op's ordinal (needs B-fix 4) and requeue, bounded by attempts. | New behaviour in the ingestion path; design first. | New W0.7 / W0.5 |
| 4 | Inspector repair levers: requeue a dead letter, clear a quarantine, reset a channel. | New inspector ops + UI. | W0.5 (defect (e) of the bug doc) |

---

## Repro-test inventory

`packages/reactor/test/bugs/` -- four files, 19 `describe.skip`ped tests, each
commented with the bug-doc link and the exact source lines it pins.

**`2026-10-03-pglite-session-poisoning.test.ts`** (A, real PGlite + dialect):
non-Kysely statement must not land inside a Kysely transaction; a transaction
whose COMMIT degraded to ROLLBACK must fail; an outside abort must fail the
transaction; a session found in an aborted transaction must be recovered; a
failed rollback must not be released and must not swallow the original error;
a recovery path must not deadlock on the base handle (the `store.ts:139` shape);
an abandoned stream must not wedge the pool.

**`2026-10-03-cursor-durability.test.ts`** (B, real `GqlRequestChannel` + mock
cursor storage): no inbox cursor for undurable operations; a failed cursor write
must be retried; a cursor rewound in storage must be honoured without a restart.

**`2026-10-03-poll-loop-liveness.test.ts`** (C, real `GqlRequestChannel` and real
`IntervalPollTimer`): no `connected` before a completed poll; a post-fetch throw
must be recorded; a hung request must time out and keep the loop alive; a bailed
poll must be distinguishable; the timer must keep ticking when the delegate never
settles and when the queue probe never settles.

**`2026-10-03-missing-ancestor-classification.test.ts`** (D, pure functions): a
missing ancestor must not classify as `UNCLASSIFIED`, must stay distinct from
`DOCUMENT_PURGED`, and must not quarantine -- end to end through the
`ChannelError` the inbox path builds.

Not covered, and why: the initiating `PORTAL_ACTIVE` state (needs PGlite/wasm
fault injection -- see "What cannot be unit-tested"); the 30s job-abandonment
interaction in `SimpleJobExecutorManager` (needs a full executor harness and
30s of fake time; the deadlock it amplifies is covered); the UNCLASSIFIED ->
quarantine -> refusal path end to end through a live `SyncManager` (the
classification and quarantine predicates are covered as units).
