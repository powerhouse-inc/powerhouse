# Retire AtomicNodeFs: deviations from the plan

Date: 2026-10-01
Companion to: [Retire AtomicNodeFs for PGlite's NodeFS](2026-10-01-retire-atomic-node-fs.md)
Branch: `feat/retire-atomic-node-fs` at 49267b7e78

The plan asks for every deviation to be recorded with file:line and the
reason. This is that record. The plan itself is unchanged. Line numbers are
against 49267b7e78. Entries read `path:line (symbol) — what — why`.

## Module layout

- `packages/reactor-api/src/pglite/pglite-node.ts` — the subpath entry is
  `pglite-node.ts`, not the plan's `index.ts` — tsdown emits declaration
  files by basename, so `src/pglite/index.ts` would overwrite the package's
  own `dist/index.d.mts`.
- `packages/reactor-api/package.json:27-31` — `types` points at
  `dist/src/pglite/pglite-node.d.mts`, where tsdown places it; the two
  older subpath entries point at flattened paths that this build does not
  produce (pre-existing, left alone).
- `packages/reactor-api/src/pglite/preflight.ts` (`preparePgliteDataDir`,
  `removeStalePgliteFiles`, `openCurrentPgliteForVerify`) — shared preflight
  steps live in reactor-api, not only in `apps/switchboard/src/pglite-preflight.ts`
  — reactor-api's own path needs the same recover → convert → stale-file
  sequence, and Switchboard reuses it.
- `packages/reactor-api/src/pglite/preflight.ts:14` (`CURRENT_PGLITE_MAJOR`)
  — the current major is the constant 17 — PGlite 0.3.15 exports no version;
  `preflight.test.ts` pins it against a fresh initdb's `PG_VERSION`.

## Durable NodeFS

- `durable-node-fs.ts:53-76` (`poisonAfterAbort`) — after an abort the wasm
  entry points are replaced with throwers and `FS.quit()` runs — PGlite's
  query-error handler re-enters the aborted runtime synchronously and spins
  at 100% CPU; no timeout can preempt it, and `pg.close()` rejects before
  `closeFs()` would release host fds.
- Post-abort state: `pg.ready === false`, `pg.closed === false`,
  `pg.close()` rejects with `PGlite aborted` — the plan's "leaves the
  instance closed" is not literally reachable; every closer tolerates the
  rejection (`packages/reactor-api/src/server.ts` `makeDbClosers`,
  `apps/switchboard/src/pglite-dialect.ts` `destroy`).
- `durable-node-fs.ts:181,199` — directory streams return 0 from both sync
  hooks — NODEFS sets `nfd` only on regular files; the plan's code would
  call `fsyncSync(undefined)`.
- `durable-node-fs.ts:11` (`EIO = 29`) — local constant — `EIO` is not in
  `@electric-sql/pglite/basefs` `ERRNO_CODES`. WASI `fd_sync` returns a
  positive errno and `__syscall_fdatasync` a negative one; `.sig` is copied
  onto the replacement import for the dylib path.
- `durable-node-fs.ts:27` (`DurableNodeFs`) — the return type carries a
  `maintenance` property — tests and operators call `maintenance.run()`.
- Module captured in `preRun` (`this.mod`), not `pg.Module`, for
  `FS.getStreamChecked` — `pg.Module` is not assigned when the import runs.
- `maintenance.test.ts` — "does not rewrite the snapshot of an idle store"
  is "reports idle when nothing was written since the last pass"; the
  VACUUM FULL case measures `base/` — no snapshot exists to rewrite.
- `durable-node-fs.test.ts:14` (`BOOT = 90_000`), `maintenance.test.ts`,
  `crash-recovery.test.ts` — 90 s to 180 s budgets — an initdb with real
  host fsync issues about 2,400 syncs: 8 s unloaded, 25 s to 45 s under
  suite load on this machine.

## Conversion

- `snapshot-reader.ts:22` (`ExtractedSnapshot.pgControl`) — optional — the
  frozen byte-level fixture has no `global/pg_control` entry;
  `convertSnapshotDir` requires it (`convert-snapshot-dir.ts:141`).
- `snapshot-reader.ts:109-114` — the reader validates only that `PG_VERSION`
  parses; "unsupported major → throw" is `openForVerify`'s job — the loader
  that owns the module list decides.
- `convert-snapshot-dir.ts:88-95` (`recoverConversion`) — one branch the
  plan's table lacks: `dir` present without `snapshot.bin` and `.converting`
  present → warn, remove `.converting` — the converted dir is authoritative.
- `convert-snapshot-dir.ts` — `system_identifier` compared as text — PGlite
  parses numerics to floats and the identifier exceeds 2^53.
- `ConversionDeps.afterStep` — test-only hook to throw after a named step —
  builds the recovery-table rows from the real sequence.
- `convert-snapshot-dir.test.ts` — recovery rows 1, 2, 5, 6 are laid on disk,
  not produced through `afterStep` — the pre-(c) cleanup removes
  `.converting` before `recoverConversion` could see it.
- `recoverConversion` logs a warn on completing a row-3 swap and on
  removing a stray `.converting` — the plan specifies no logging there.
- `convert-snapshot-dir.test.ts:80`, `preflight.test.ts:51` — 90 s budgets
  — extraction fsyncs every file and directory it writes.

## reactor-api wiring

- `src/utils/db.ts:73` (`isPostgresConnectionString`) — `isPG` renamed and
  exported — the server preflight gate and `getDbClient` share one predicate.
- `test/db-client-sharing.test.ts:27-33` — `fsync: false` and a `destroy()`
  helper that closes PGlite after `knex.destroy()` — knex-pglite only closes
  a PGlite it connected to; without it tests left an initdb running under a
  deleted tmpdir.
- `test/pglite/preflight.test.ts` — two cases beyond the plan: missing dir,
  snapshot of another major.

## Switchboard wiring

- `apps/switchboard/src/server.mts` (`pgliteFsyncFor`) — PG16 dirs over
  `pglite-legacy-02` keep `fsync` on — op1b does not throw there, but
  0.2.17 runs `wal_sync_method=open_datasync`, which NODEFS drops, so the
  fdatasync hook never fires: 0 host syncs per commit, 27 on CHECKPOINT.
  PG16 stores are checkpoint-durable until `--migrate-pglite`; one warn per
  PG16 dir says so. Decision 5's "stock fallback" was not needed.
- `apps/switchboard/src/pglite-preflight.ts:78-80` — stale files are
  removed again after a successful `migratePgliteDir` — the migration's
  own PG17 close leaves a fresh `postmaster.pid`.
- `apps/switchboard/src/pglite-preflight.ts:55-60` — `PH_FORCE_PG_VERSION`
  wipes `.converting` and `.old` too — a forced boot dying before initdb
  would otherwise leave `dir` missing beside `.old`, which the next boot
  refuses.
- `apps/switchboard/test/pglite-preflight.test.ts` — cases call
  `runPglitePreflight` directly, not `startSwitchboard` — a full boot per
  case is 20 s to 60 s; the ordering is the unit under test. Two extra
  cases: in-memory no-op, force wipe.
- `apps/switchboard/test/snapshot-writer.ts` — copied from reactor-api's
  test dir — a relative import fails TS6307 under composite projects.
- `apps/switchboard/src/pglite-migration.ts:111-128` — `migratePgliteDir`
  dumps from an in-memory legacy instance loaded with `loadDataDir` from a
  `dumpDataDir` tar — pglite-tools 0.2.x drives pg_dump through files in the
  PGlite FS, and 0.2.17's NODEFS `write` ignores the view's `byteOffset`, so
  every query message arrived as zeros. `--migrate-pglite` had never
  completed on `main`. The whole store is held in memory during the dump.
  Commit cbd1e67997's message calls the PG16 preflight case "red on purpose";
  8084fa5b1e made it green.

## Reactor tests

- `packages/reactor/test/factories.ts:131-139` (`nodeFsBackend`) — the
  template store is built once per test file and removed in `afterAll`, not
  once per worker — `process.once("exit")` does not run when vitest tears
  down a forked worker; three templates survived a three-file run.
- `packages/reactor/test/factories.ts:157-163` — the template build removes
  `pg_wal/xlogtemp.*` — a copied `xlogtemp.42` blocks every per-test open.
- `packages/reactor/static-x-baseline.json:190` — dead-export key renamed by
  hand — static-x has no in-repo regenerator.

## Docs and housekeeping

- `docs/adr/0004-pglite-nodefs-over-atomic-snapshot.md` — `Status: Accepted`
  — the plan is committed to `main` and implemented in this PR.
- The ADR landed in commit 4e763223e3 with the release notes — its own
  commit message failed commitlint's subject-case rule and the staged file
  rolled into the next commit.
- `apps/academy/.../05-DockerDeployment.md` — `PGLITE_FLUSH_INTERVAL_MS`
  never appeared there; its removal is a no-op.
- `patches/` holds no pglite-fs patch; the one in memory notes lives in a
  consuming repo.
- `packages/reactor/bench/TASKS.jsonl:24` still contains `pglite-fs` in a
  historical note — the records guard forbids editing bench records.
- Maintenance logs only on failure; `server.mts` passes no interval, so the
  5-minute default applies. A 10-minute real-store run logged nothing, which
  is consistent with success but does not observe the pass; the unit tests do.

## Exit criteria run

- Real store: a copy of a `ph vetra` project's `.ph` (reactor-storage 30.0 MB,
  read-storage 28.4 MB, both pure snapshot). Boot 1 converted both (17.9 s
  and 12.1 s), 24 documents read back; boot 2 converted nothing, same ids.
- Kill -9: 5 cycles with 4 writers creating documents and, every fifth
  iteration, an attachment reservation in read-storage. 282 acked documents
  and 48 acked reservations, 0 missing after reopen; reopen 4.8 s to 6.0 s.
- Not run: `check-windows.yml` (needs a push) and the downgrade path.
