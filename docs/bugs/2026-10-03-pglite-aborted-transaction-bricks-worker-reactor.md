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
