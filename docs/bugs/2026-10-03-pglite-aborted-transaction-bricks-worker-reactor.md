# PGlite aborted transaction + active portal bricks the worker reactor (sync "dies")

**Found:** 2026-10-03, live soak against the distyra-test "Accounts" drive
(`n5Y8wYWRjEXgKHjihmUscKn2jWe8SFrJL_9_01uxsLo`, ~375 revisions), Connect worker mode
(`?reactorWorker=true`), branch `feat/multi-reactor` (= `feat/reactor-worker-packaging` + docs).
This is believed to be the root cause of the long-observed "Connect↔Switchboard sync
stops after enough time" on the Accounts drive.

## Repro (took ~6 minutes, not hours)

1. Fresh worker-mode Connect against local vetra Switchboard (distyra-test).
2. Add the Accounts drive as a remote → bulk catch-up of ~375 revisions begins.
3. Concurrently, every ~65s: rename one document server-side (pull direction) and a
   different document browser-side (push direction) — see
   `scratchpad/soak-accounts.sh` methodology (alternating `renameDocument` via GraphQL
   and `client.rename` via RPC).
4. Between soak cycles 4 and 7 (~6 min in), every read through the worker began failing.

## Observed state (all via live inspector RPC / RPC error replies)

- Every `client.get(...)` and inspector `queryReactorDb('SELECT 1')`:
  `current transaction is aborted, commands ignored until end of transaction block`
  → the worker's single shared PGlite connection has an open transaction in aborted
  state; since PGlite is single-connection, the entire reactor (reads, writes, sync
  ingestion, read models) is dead.
- `queryReactorDb('ROLLBACK')`: `cannot drop active portal ""` → a suspended
  streaming/cursor query (portal) is still active on the connection; the transaction
  cannot even be rolled back. SQL-level recovery is impossible; only a worker restart
  clears it.
- Queue state via inspector: `{isPaused:false, pendingJobs:[], executingJobs:[]}` —
  the job pipeline is NOT wedged; the open transaction/portal was left outside (or
  despite) the job error path.
- All 4 sync channels report `connected`, failureCount 0, pushFailureCount 0 the
  entire time — connection state is green while storage is dead.
- Page console: silent (failure is inside the SharedWorker). Server-side vetra log: silent.
- Push direction (browser→server renames) had already stopped propagating by cycle 2–4;
  worth checking whether the poisoning predates the first full failure.

## Mechanism hypothesis

Some component streams rows on the shared PGlite connection (Kysely `.stream()` /
paged cursor — hits in `packages/reactor/src/storage/kysely/store.ts`,
`document-purger.ts`, interfaces) and abandons the iterator mid-flight, or a
concurrent statement interleaves on the single connection while the portal is
suspended; a statement then fails, the transaction enters aborted state, the error
path never completes/closes the portal nor rolls back, and the connection is
permanently poisoned. Likely load-dependent (bulk catch-up + concurrent reads/writes
widen the interleaving window), which is why it presents as "dies after enough time."

## Follow-ups

1. Root-cause: audit every streaming/cursor read and transaction error path in
   `packages/reactor` storage + sync ingestion for abandoned iterators / missing
   rollback/portal close on the single-connection PGlite path; build a unit repro.
2. Robustness: storage watchdog — detect aborted-transaction state (cheap probe or
   error classification), attempt portal close + rollback, escalate to controlled
   component restart; emit an event either way.
3. Observability (W0.5): surface storage health in the inspector; connection state
   must not read "connected/green" while every statement fails — add a DB-health
   dimension to sync/queue status.
4. Re-run the Accounts soak after the fix (same script) as the regression gate.

## Addendum: non-durable reads + rollback on restart

Immediately before the brick, the worker reported drive revision document:373/global:263.
After `adminClient.restart()`, the fresh worker serves document:340/global:230 — the
~33 revisions "ingested" inside the poisoned transaction were never durably committed,
yet reads served them as current state. Two extra defects implied:
(a) reads can reflect an uncommitted transaction's state (consistency tokens/watermark
presumably advanced past durability), and (b) restart silently rolls back to the last
durable state and relies on sync to re-pull the gap. Watch the post-restart soak cycles
for whether catch-up closes the gap without manual intervention.

## Addendum 2: cursor-ahead-of-durable-data, dead-letter burial, and a silently dead poll loop

Post-restart forensics (same session, via inspector RPC and direct SQL):

1. **Permanent gap mechanism confirmed.** After the rollback-on-restart, the Accounts
   channel's inbox cursor in `reactor.sync_cursors` stood at 16796 with fresh
   `last_synced_at` — ahead of the rolled-back data. Polls returned empty ("caught
   up"), the local drive froze at 340/230 vs server 375/267, indefinitely, with all
   channels green.
2. **Dead-letter burial.** 40s after restart, a new inbound op for
   `distyra/original-source-queue` doc `vq9tPk…` dead-lettered as
   `error_type: UNCLASSIFIED`, "Document not found" — its ancestor state was in the
   rolled-back batch. Every future op touching a rolled-back document will follow.
   A missing-ancestor inbox failure is repair-signal, not garbage.
3. **No live cursor-rewind lever.** Setting `cursor_ordinal = 0` via SQL did nothing:
   channels hold cursor state in memory and persist on advance. Rewind only takes
   effect at channel init (worker restart). Manual repair playbook that worked
   partially: SQL rewind + `adminClient.restart()` → channel re-pulled 0→9770 and the
   dead letter was cleared (re-applied once its ancestor existed again).
4. **Then the re-pull stalled with a silently dead poll loop.** Cursor frozen at 9770,
   drive still 340/230, queue empty/unpaused, storage healthy — and the Accounts
   channel's ConnectionStateSnapshot read `state: "connected", lastSuccessUtcMs: 0,
   lastFailureUtcMs: 0`: not one completed poll since boot, reported as connected.
   (The three healthy channels showed fresh lastSuccessUtcMs.) Either the poll timer
   died to an escaped exception, or the first poll request hangs without timeout
   (plausible: a cursor-0 re-pull asks the server for ~16k envelopes in one go).

Defects to fix (causal order): (a) transaction/portal left open on error —
root brick; (b) cursor persistence not atomic with applied-op durability; (c)
poll-loop death is unreported — connection state must distinguish "never succeeded"
from "connected", and the loop needs an un-killable supervisor + request timeout;
(d) `UNCLASSIFIED` missing-ancestor dead letters should be classified and feed a
repair/backfill path; (e) inspector needs repair levers: rewind cursor, reset
channel, requeue dead letter.

## Regression run 2 (post-fix, 2026-10-03) — PARTIAL PASS

Fresh worker on the rebuilt fixed dist (commits 7beab676d1..91f8d495b8), Accounts
drive, bounded foreground verdict (scratchpad/verdict.sh). Machine at ~90% RAM.

FIXED (proven):
- Bulk-pull transaction deadlock (A-1): drive CONVERGED to server rev 375 (run 1
  bricked ~340 and never converged). The pull completes under the same load.
- Silent death → loud refusal: recurring poisoning now surfaces as
  `The PGlite session is unrecoverable` (HardenedPGliteDialect's
  PGliteSessionPoisonedError) instead of a green-stated hang. No silent divergence;
  the dialect refuses rather than committing corrupt data.

STILL OPEN:
- Under concurrent rename load AFTER convergence, the session is poisoned again
  (verdict cycles 2-3). This is the A-2 path: a wasm-level failure mid-Execute
  leaves the portal PORTAL_ACTIVE; the dialect detects and refuses but cannot clear
  it without a worker restart. Liveness defect remains; recovery still = restart.

KEY CORRELATION: the recurrence happened at 2-3 GB free RAM (full 375-rev dataset on
a 32 GB machine at ~90% use). A-2's named root cause is an IDBFS/OOM error mid-Execute
— which severe memory pressure makes far more likely. The remaining brick may be
substantially memory-pressure-induced rather than a pure logic defect; needs re-test
in a memory-healthy environment to separate the two.

NEXT (new work package — liveness/recovery, W0.7 candidate):
1. Auto-recovery: on PGliteSessionPoisonedError, the reactor should restart its own
   PGlite session/worker automatically (today an operator must restart), and sync
   must re-pull the gap — with cursor-vs-durability already fixed, this should be safe.
2. Separate the memory variable: re-run the verdict with the browser worker given
   headroom (close other consumers / smaller dataset / more RAM) to confirm whether
   A-2 persists absent OOM-level pressure.
3. Investigate the ~18 GB footprint for 375 revs / 100 statements (PGlite-wasm bloat)
   — reducing it would both ease the test and shrink the A-2 trigger window.

## Regression run 3 (post-W0.5/W0.7, hardened both ends, healthy RAM) — two new findings

Setup: full dist chain rebuilt (incl. switchboard), fresh caches, 18.5 GB free at start,
memory stayed 3.5-8.7 GB free throughout (no reap, no OOM at the OS level).

FINDING A — THROUGHPUT CLIFF (durability cost): no poison, no brick; storage stayed
healthy (getStorageHealth: healthy, never recreated — the W0.5 op worked live over RPC).
But bulk catch-up ran at ~2 ops/sec: the Accounts collection is ~16,600 ops
(liveLatestOrdinal 16599) and the durable store now flushes per op
(relaxedDurability:false). W0.5 inspection showed the truth in one query: inbox depth
277 draining slowly, cursor 3464→3623 over 20s, queue steady at 1 executing. The
single-threaded worker saturates; the tab UI freezes (render storm + starved RPC).
Verdict script's 4-min window said STALLED on what was actually SLOW — the exact
slow-vs-stuck distinction, now measurable. Full catch-up would take ~2h.
=> The durable-flush-per-op design needs a batched-flush/group-commit with cursor
checkpointing; AND this empirically demonstrates the browser local-first ceiling that
motivates the multi-reactor remote routing (motivation 1 of the plan).

FINDING B — SILENT STATEMENT HANG WEDGES EVERYTHING (new defect class): ~15 min into
the grind the SharedWorker wedged completely: 0% CPU over 6s, heap collapsed to
~700 MB, all RPC (including pauseQueue) hung, a fresh tab attached to the worker and
hung at hello. No error surfaced anywhere. Mechanism: an in-flight PGlite statement
that never settles (wasm internals died mid-call) produces NO error — the connection
lease is never released, bounded-acquire only bounds WAITERS not the holder, the
self-heal triggers only on PGliteSessionPoisonedError (an error), so nothing heals.
All of today's hardening covers stuck-LOUD; this is stuck-SILENT one layer down.
=> Fix: statement-level deadline in HardenedPGliteDialect (configurable; generous
default) that converts a hung statement into the poison/self-heal path, so a dead
wasm call becomes a recreate instead of a permanent silent wedge.

Data point for the durability fix working: the ~340 revisions applied before the wedge
are durably in idb and survive restart (verified by fresh boot reading rev 340).

## W0.8 fixes for run 3's two findings (implemented 2026-10-03)

### Finding B — statement-level deadline (`HardenedPGliteDialect`)

Every statement the dialect runs is now bounded, and an expiry is routed into
the existing poison path (`onPoisoned` -> `SelfHealingPGliteClient.recreate`,
or the loud `PGliteSessionPoisonedError` refusal when no replacement opens).

- **Covered paths:** `executeQuery`, each pull of a streaming read, the
  transaction-control statements (BEGIN / the guarded COMMIT / ROLLBACK, which
  bypass the connection wrapper and go straight at the client), and the
  release-time recovery `exec`. The last one matters because Kysely awaits
  `releaseConnection`: an unbounded probe would hold the lease forever and move
  the silent wedge rather than cure it.
- **Defaults:** `statementTimeoutMs` 120s, `longStatementTimeoutMs` 900s for
  statements `isLongRunningStatement` recognises (vacuum / analyze / reindex /
  cluster / checkpoint / copy / truncate / refresh / DDL), `recoveryTimeoutMs`
  15s. 0 disables. The bound is per STATEMENT, not per transaction, so bulk
  ingestion holding the lease for an hour is unaffected as long as its
  individual statements settle - that, plus the long bound for the data-sized
  statements, is why the deadline cannot false-positive on legitimate work.
- **Generation guard:** a wasm call cannot be aborted, so a timed-out call is
  abandoned rather than cancelled. The driver bumps a generation on escalation;
  a late settlement whose generation no longer matches writes nothing, so it
  cannot mark the FRESH connection suspect or make release-time recovery roll
  back a transaction belonging to the replacement session. Escalation is
  single-flight, so one hung statement produces exactly one poison report.
- **Self-heal exemption:** the recreate runs outside the dialect (close + open
  on the instance, under `closeTimeoutMs`), so it is not subject to the
  statement deadline and cannot recurse into it.

### Finding A — group commit, and where the durability boundary now sits

`SelfHealingPGliteClient` is also the reactor's durability barrier
(`IStorageFlusher`), because the two jobs are the same job: a recreate falls
back to the last flushed snapshot, so the instance-lifecycle owner is the only
thing that can say what durable means.

- **Mechanism.** The store still opens WITHOUT `relaxedDurability`, so
  `pg.syncToFs()` is a real awaitable flush. `setDeferredFlush(true)` shadows
  the instance's `syncToFs` with a no-op for the duration, so PGlite's
  automatic post-statement sync stops costing anything, while the captured
  original stays reachable for the explicit `flush()`. The failure direction is
  safe by construction: if a future PGlite stops routing its automatic sync
  through the instance method, the suppression silently stops working and the
  store is slow again - never unflushed. Deferral is re-applied after a
  recreate, and `close()` flushes and lifts it (PGlite's own `close` relies on
  the per-statement sync of its final protocol message).
- **Group commit.** Concurrent `flush()` callers share one filesystem sync. The
  covered watermark is captured at the moment the snapshot starts, after the
  statement in flight has finished, so the group is as wide as it can safely
  be. A flush with nothing run since the last completed one is free. Statements
  are held back while a snapshot is taken, reproducing the property PGlite gets
  from holding its query mutex across the per-statement sync - without it the
  sync would read a filesystem something is writing to.
- **Boundary 1, sync cursors.** `FlushGuardedSyncCursorStorage.upsert` flushes
  before it writes a cursor row, and a failing flush takes the cursor write with
  it. This is the single choke point for every cursor write (inbox, outbox, the
  rewind lever, and `GqlResponseChannel` too), and it is downstream of
  `GqlRequestChannel.writeCursor`'s existing serialisation, so a burst of
  applied operations coalesces into one cursor write and therefore one flush -
  the batching is structural rather than a tuned timer. The cursor row itself
  is deliberately not flushed afterwards: a crash between the two loses the
  advance but keeps the data, and a re-pull of already-applied operations is
  idempotent. The reverse - the permanent-gap mechanism of addendum 2 - is now
  impossible.
- **Boundary 2, job terminal success.** `SimpleJobExecutor` flushes before
  emitting `JOB_WRITE_READY`, which is what `waitForJob` turns into terminal
  success and what the consistency token and W0.5's requeue-drop rest on.
  `load` jobs are EXEMPT: their operations came from a remote and boundary 1
  already keeps the inbox cursor from advancing past them, so a crash loses only
  work the next poll re-pulls. That exemption is the throughput fix - bulk
  catch-up is nothing but load jobs.
- **Also flushed:** the schema, once, after auto-migrations - not an
  acknowledgment, but the one thing that is both expensive to re-apply and not
  re-pullable.
- **Default posture unchanged.** The barrier defaults to `NoopStorageFlusher`,
  correct for any store already durable per statement (server Postgres, or
  PGlite without deferral), and deferral only engages where a holder asks for
  it AND the session really exposes a filesystem sync. Connect's worker reactor
  store and reactor-monitor's owned durable store enable it; the relational /
  read-model store, memory stores and caller-owned instances do not.
- **Measured.** 500 synthetic operations, real fsync standing in for the
  browser's IDBFS `syncfs`
  (`test/storage/kysely/group-commit-throughput.test.ts`): 500 flushes /
  1183ms flush-per-statement versus 10 flushes / 123ms batched at 50 - a
  **9.6x** wall-clock speedup and a 50x reduction in flushes (re-measured after
  the redesign round below; unchanged). The live gap is
  larger on both counts: an IDBFS `syncfs` over a whole Postgres data directory
  costs far more than a single-file fsync, and one operation costs several
  statements.

**The invariant that survives all of it:** no cursor and no durable-success
acknowledgment ever points past data that is not flushed. A crash can lose only
work that will be re-pulled by sync or re-run by its caller.

### W0.8 redesign round (2026-10-03): ten confirmed findings, one cause

An adversarial review of the above confirmed ten correctness findings. They had
one cause, worth stating plainly because it is the lesson rather than the list:
**the flush and quiescence mechanisms were sound in concept, but their state was
GLOBAL while the PGlite instance is REPLACEABLE** - and the durability
boundaries were enforced inside implementations instead of at seams, so any new
implementation or construction path silently lost them.

**Epoch scoping (findings 1, 2-storage, 3-gate, 6).** All per-instance state now
lives in one `PGliteEpoch`: the instance, its captured `syncToFs`, the statement
sequence, the flush watermark, the statement accounting, the statement gate and
the in-flight flush. `recreate` swaps a fresh epoch in with one assignment and
retires the old one, whose gate opens and whose waiters reject. Every statement,
flush and watermark access happens against an epoch captured on entry, so:
- an abandoned hung statement's accounting is discarded with its instance
  instead of leaking a count that wedged every later flush (finding 1);
- a flush cannot credit the fresh instance for statements that fell back with
  the old one - it rejects with the retriable `PGliteEpochSupersededError`
  (finding 2, storage half);
- retiring an epoch frees whatever is parked on its gate even if the old
  filesystem sync never settles (finding 3, gate half);
- there is no second clock racing the statement deadlines: the quiesce bound
  defaults to 0, meaning the flush waits for the statement in flight, which is
  bounded by that statement's own deadline in the dialect. A sanctioned
  15-minute maintenance statement therefore no longer makes every concurrent
  flush stall for three minutes and fail (finding 6).

**The filesystem sync is bounded (finding 3, B).** `flushSyncTimeoutMs`
(120s default) bounds `syncToFs`, and an expiry goes to `onSyncStuck`, which the
hosts wire to the same escalation as the dialect's `onPoisoned`: recreate in
place, worker reload if no replacement opens. A hung sync is now a recreate, not
a permanently parked flush holding the statement gate.

**Sync state rewinds on recovery (finding 2, sync half).** The persisted cursors
are safe by boundary 1, but the channels' in-memory cursors are stale-HIGH the
moment the store falls back. `SyncManager` subscribes to
STORAGE_SESSION_RECREATED and resets every channel through W0.5's
`resetChannel`, so each one re-initialises from the persisted rows and re-pulls
the lost tail - the repair that previously needed a SQL rewind plus an operator
restart. It subscribes rather than being wired per host, because the channels
are its own state and all three hosts already emit the event.

**Boundaries at seams (findings 4, 5, and the cursor-storage altitude point).**
- `FlushGuardedSyncCursorStorage` is boundary 1 as a decorator around ANY
  `ISyncCursorStorage`, so a caller-supplied storage (the stage-1 `LocalChannel`
  is coming) inherits the invariant. It also brackets the write with the
  flusher's `storageEpoch`, refusing a cursor advance whose covering flush
  belongs to a replaced session.
- `ReactorBuilder` fills in a caller SyncBuilder's barrier only when the caller
  chose none (`withDefaultStorageFlusher`), instead of overwriting a configured
  one with its default no-op (finding 4).
- `ReactorBuilder.build()` REFUSES `withWorkerPool` or `withExecutor` together
  with a deferring barrier (finding 5). A live flusher object cannot cross a
  worker boundary, and a caller-supplied manager builds its own executors, so
  boundary 2 would be silently absent; `buildWorkerExecutor` takes a `flusher`
  for the day a worker opens a deferring store of its own.

**Announce-on-flush-failure (finding 7).** The job's transaction has already
committed when the flush runs, so reporting FAILED told callers to redo
committed work. The flush is retried with bounded backoff (5 attempts, the
executor's retry delays) because any later group commit covers these writes too;
the announcement is released as soon as one succeeds. If all attempts fail the
announcement is WITHHELD and the job is still not failed: it stays RUNNING, so
`waitForJob` neither succeeds nor fails and its caller times out - the honest
answer for a write that happened but is not durable, with the self-heal path
already handling the store. The exception is `StorageEpochSupersededError`,
which is not retried: the session was replaced, the commit itself fell back, and
FAILED is then the truth.

**Deadline coverage (findings 8, 9).** The BEGIN retried after an
aborted-transaction recovery now goes through `runStatement` like every other
statement - it is issued at a session that just failed, so it is the likeliest
one to hang. And every failure-recording path goes through one generation-guarded
helper, so a timed-out COMMIT can no longer mark the FRESH session suspect; a
connection whose incarnation was replaced is retired outright, carrying neither
its failure nor its open transaction forward, which also stops the release-time
recovery from rolling back a replacement session's transaction.

**The load exemption (finding 10).** `load` and `loadBatch` are PUBLIC reactor
APIs, so the job kind never meant "a cursor is protecting these operations". The
exemption keys on a `cursorProtected` job-meta flag that only the sync manager's
own inbox call sites set; a direct `load`/`loadBatch` keeps the full durability
semantics.

**Residual window, stated precisely.** The cursor guard brackets the write with
the storage epoch read BEFORE the flush and compared after the write, so a
recreate anywhere in that window refuses the advance. What it cannot undo is a
recreate landing INSIDE the inner write: the row then sits unflushed in the
replacement's memory while the call refuses. The recreate-triggered channel
reset re-reads cursors, so the exposure is one unflushed row, and closing it
completely needs the cursor row written in the same transaction as the
operations it covers - a property only a local channel can have.

**Still browser-pending (gate for regression run 4):** deferral is wired into
the live worker but has not been exercised in a browser. What run 4 must show:
bulk Accounts catch-up well above 2 ops/sec; after a hard tab kill mid-catch-up,
the inbox cursor at or behind the last durable operation and the gap re-pulled;
a hung statement surfacing as STORAGE_SESSION_RECREATED rather than a silent
wedge.
