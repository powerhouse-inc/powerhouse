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
