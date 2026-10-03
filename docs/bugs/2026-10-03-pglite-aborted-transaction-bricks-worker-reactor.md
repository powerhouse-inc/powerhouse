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
