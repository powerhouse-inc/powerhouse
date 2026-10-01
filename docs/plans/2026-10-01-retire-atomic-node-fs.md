# Plan: Retire AtomicNodeFs for PGlite's NodeFS

Date: 2026-10-01 (against `main` at f488457d12, after PR #3149)
Status: proposal, not started. Written for agents implementing from `main`.
Paths are relative to the repo root.

## Motivation

Switchboard and `ph vetra` store the reactor (`./.ph/reactor-storage`) and
the read models (`./.ph/read-storage`) in PGlite over `AtomicNodeFs`
(`packages/pglite-fs/src/atomic-node-fs.ts`): a `MemoryFS` subclass that
serializes the whole PGDATA tree into one `snapshot.bin` (write, fsync,
rename) on every `syncToFs`. It landed 2026-05-13 (736ae675b0) because
PGlite data dirs became unopenable after crashes. That corruption was
observed while Switchboard opened three PGlite instances on one data dir;
the fix for that landed 2026-05-19 (8a8030ee09, the `getDbClient` cache).
No single-instance repro of stock-NodeFS corruption ever existed.

The snapshot costs are structural, not tunable:

- Every flush is O(database size). Switchboard runs `flushIntervalMs=100`
  (`apps/switchboard/src/server.mts:148`); reactor-api's own branch
  (`packages/reactor-api/src/utils/db.ts:129`) passes no options, so the
  read-model store snapshots synchronously on every statement.
- The deferred flush loses every acknowledged commit since the last
  completed snapshot on any crash: at least 100 ms, plus one full-tree write.
- Nothing reads `snapshot.bin`: no `pg_dump`, no explorer, no CLI.
- The deferred timer starves under a hot writer because PGlite's query path
  never yields to the event loop.
- A legacy-migrated dir keeps stale loose PGDATA beside `snapshot.bin`, and
  a pure-snapshot dir has no loose `PG_VERSION`, so `migratePgliteDir`
  logs "No PG_VERSION; skipping" and a PG16 store silently skips the major
  upgrade (`apps/switchboard/src/pglite-migration.ts:89-95`).

Stock NodeFS (`new PGlite({ dataDir })`) keeps a real PGDATA on disk and
lets Postgres do its own crash recovery. The experiments below show it is
safe against process crashes, faster at every size, and that its one real
gap (no host `fsync`) can be closed inside a subclass.

## Evidence

Experiments run 2026-10-01; scripts and full results are in the session
scratchpad (`sqlite-research/06, 08, 09, 10, 11`).

| Question | Result |
|---|---|
| Does stock NodeFS corrupt on SIGKILL? | No. 92 cycles on macOS (0.3.15 and 0.5.8) + 22 on Linux (node:24, overlayfs), one instance per dir, dirs to 2.7 GB, up to 309 MB unreplayed WAL, kills mid-CHECKPOINT and mid-VACUUM: 0 unopenable dirs, 0 lost acknowledged commits. Every reopen ran normal Postgres recovery. |
| Real Switchboard on NodeFS? | 11 `kill -9` + 2 SIGTERM under 4 concurrent GraphQL writers: 4,509 acked writes, 0 lost; both stores reopened every time. Reactor suite: 0 NodeFS-specific failures. Switchboard suite 498/501; the 2 failures are `boot-unsupported-stored-documents.test.ts` seeding through AtomicNodeFs while booting under NodeFS. |
| Throughput (10-row txn/s) | 10 MB: 1570 vs 21. 200 MB: 1123 vs 2.6. 1 GB: 938 vs 0.6. |
| Cold open | NodeFS 110-150 ms at every size. AtomicNodeFs 0.44 s / 1.4 s / 7.7 s at 10 MB / 200 MB / 1 GB. |
| Reopen after crash | ~2.3 ms per MB of un-checkpointed WAL (954 MB → 2.4 s). A CHECKPOINT before the kill → 0.21 s. |
| Does NodeFS fsync? | No. Emscripten NODEFS has no `fsync` stream op and `__syscall_fdatasync` is `return 0`; `strace` saw 0 sync syscalls over thousands of commits. 0.3.15 (the repo pin) reports `fsync=on` and believes it; 0.5.8 starts with `-F`. Upstream issue #1107. So stock NodeFS is app-crash durable, not power-loss durable. |
| Can a subclass fsync? | Yes ("op1b"): patch `FS.filesystems.NODEFS.stream_ops.fsync` and replace the `__syscall_fdatasync` import with `fs.fdatasyncSync(stream.nfd)`. 1 device sync per commit on 0.3.15 and 0.5.8. Throughput 1195 → 440-560 tps on 0.3.15 (160 on 0.5.8, cause unknown). Still 20x+ AtomicNodeFs at 10 MB and 200x+ at 200 MB. Fsyncing in `syncToFs` instead is slow (43 syncs/commit) and leaves `base/*` unsynced. |
| snapshot.bin → PGDATA? | `restoreMemfs` needs only `analyzePath/mkdir/chmod/writeFile`, so a ~25-line `node:fs` adapter converts a 163 MB snapshot in 182 ms, byte-exact on 12 probes; the result opens with a clean shutdown checkpoint. Stale-loose-files hazard reproduced: NodeFS silently opens the stale tree beside `snapshot.bin`. |
| Incidental | PGlite leaves `postmaster.pid` behind after a clean `close()` (NodeFS `closeFs` is `FS.quit()`), so the preflight's "Removed stale PGLite lockfile" warning fires on every boot. One `could not create file "pg_wal/xlogtemp.42": File exists` on a fresh open right after a clean close (PGlite's fixed wasm pid). SIGTERM under load fired in 22 ms, but total shutdown took 10.3 s upstream of store close. |

## Decisions

1. **Replace AtomicNodeFs with a NodeFS subclass, not with a tuned
   snapshot.** The snapshot is O(size) per flush by construction. The
   experiments remove the reason it existed.
2. **Fsync on by default (`PH_PGLITE_FSYNC=1`), off allowed.** AtomicNodeFs
   is often described as durable; in Switchboard's configuration it loses the
   last ≥100 ms of acknowledged commits on every crash and fsyncs only
   completed snapshots. The subclass with op1b is durable before ack on every
   commit and still 20x faster than today at small sizes. Off trades
   power-loss durability for ~2.5x throughput; that is a deployment choice
   (CI, in-memory-like dev loops), not the default. The 0.5.8 cost (8.4 ms
   per sync) is a risk for the PG18 upgrade, not for the repo pin.
3. **Maintenance stays inside the filesystem object.** PR #3149's periodic
   VACUUM then CHECKPOINT moves into the subclass with the same lifecycle
   (`initialSyncFs` schedules, `closeFs` cancels and awaits the pass) and the
   same `_runExclusiveQuery` + ReadyForQuery guard. On NodeFS the CHECKPOINT
   is what bounds reopen time after a crash. `vacuumFullAboveBytes` is
   measured against the size of `base/` at open instead of the snapshot.
4. **A new package `@powerhousedao/pglite-node` hosts the subclass.** It is
   needed by `packages/reactor/test/factories.ts`, `reactor-api` and
   `switchboard`; reactor-api depends on reactor, so neither can host it.
5. **The subclass is built over the loaded module's `NodeFS`.** Switchboard
   opens PG16 dirs with `pglite-legacy-02` (0.2.17) until `--migrate-pglite`
   runs. op1b was verified on 0.3.15 and 0.5.8 only; stage 1 verifies 0.2.17
   or declares PG16 dirs stock-NodeFS (app-crash durable) until migrated.
6. **ENOSPC becomes a fatal shutdown through `onAbort`, not through a flush
   callback.** `onFlushError → triggerFatalShutdown` has no equivalent on
   NodeFS. A failed WAL write or fdatasync is a Postgres PANIC, which in wasm
   is an Emscripten abort; the subclass routes `emscriptenOpts.onAbort` to a
   caller hook and Switchboard wires that to `triggerFatalShutdown`. Stage 1
   verifies the path with an injected failing `fdatasyncSync`.
7. **`snapshot.bin` present means authoritative.** Conversion never trusts
   loose files beside a snapshot, never writes into the existing dir, and
   verifies by opening with stock NodeFS, never through AtomicNodeFs (which
   rewrites `snapshot.bin` on close).
8. **Conversion is a layout change, not a major change.** It runs whenever
   the store mode is `nodefs`, without `--migrate-pglite`, and before
   `readPgVersionFile`/`migratePgliteDir`. That order also fixes the
   PG16-snapshot bug.
9. **One release of overlap.** `PH_PGLITE_FS=snapshot` keeps AtomicNodeFs
   reachable for one release after the default flips; pglite-fs stays
   published as the migration reader for that release; then both go. After
   that, a dir holding `snapshot.bin` is refused with the last converting
   version named.
10. **Single-instance guard is the existing `getDbClient` cache.** No lock
    file; multi-instance on one dir remains unsupported, as today.
11. **Connect is untouched.** `idb://` and the browser build are out of scope.

## Design

### Flags

| Variable | Values | Stage 1 default | Stage 3 default | Stage 4 |
|---|---|---|---|---|
| `PH_PGLITE_FS` | `nodefs`, `snapshot` | `snapshot` | `nodefs` (warns on `snapshot`) | removed |
| `PH_PGLITE_FSYNC` | `1`, `0` | `1` | `1` | kept |
| `PGLITE_FLUSH_INTERVAL_MS` | ms | as today (snapshot only) | warns under `nodefs` | removed |

Resolved in `apps/switchboard/src/config.ts` beside `migratePglite`, carried
on `StartServerOptions` as `pgliteFs` and `pgliteFsync`
(`apps/switchboard/src/types.ts`). `ph vetra` and `ph switchboard` call
`startSwitchboard` in-process (`clis/ph-cli/src/services/switchboard.ts:128`)
and inherit both. reactor-api's own branch reads the env directly.

### The durable NodeFS

```ts
// packages/pglite-node/src/durable-node-fs.ts
export interface DurableNodeFsOptions {
  fsync?: boolean;                 // default true
  maintenanceIntervalMs?: number;  // default 5 min; 0 disables
  vacuumFullAboveBytes?: number;   // base/ size at open; default 256 MB; 0 disables
  logger?: { warn(message: string): void };
  onAbort?: (what: unknown) => void;
  hostFs?: Pick<typeof fs, "fsyncSync" | "fdatasyncSync">; // tests inject
}

type NodeFsClass = typeof import("@electric-sql/pglite/nodefs").NodeFS;

// Built over the loaded module's class so PG16 dirs on pglite-legacy-02
// get the same behaviour.
export function createDurableNodeFs(
  Base: NodeFsClass,
  dataDir: string,
  options?: DurableNodeFsOptions,
): InstanceType<NodeFsClass>;
```

`init` wraps the base result:

```ts
async init(pg, opts) {
  const { emscriptenOpts } = await super.init(pg, opts);
  const inner = emscriptenOpts.instantiateWasm;
  if (this.fsync && !inner) throw new Error("PGlite did not supply instantiateWasm");
  return {
    emscriptenOpts: {
      ...emscriptenOpts,
      onAbort: (what) => this.onAbort?.(what),
      preRun: [
        ...(emscriptenOpts.preRun ?? []),
        (mod) => {
          if (!this.fsync) return;
          mod.FS.filesystems.NODEFS.stream_ops.fsync = (s) => this.hostFs.fsyncSync(s.nfd);
        },
      ],
      instantiateWasm: this.fsync
        ? (imports, done) => {
            imports.env.__syscall_fdatasync = (fd: number) => {
              try {
                this.hostFs.fdatasyncSync(pg.Module.FS.getStreamChecked(fd).nfd);
                return 0;
              } catch (err) {
                this.logger?.warn(`fdatasync failed: ${String(err)}`);
                return -ERRNO_CODES.EIO; // Postgres PANICs; onAbort fires
              }
            };
            return inner(imports, done);
          }
        : inner,
    },
  };
}
```

`initialSyncFs` measures `base/` and schedules maintenance; `closeFs`
cancels the timer, awaits an in-flight pass, then calls `super.closeFs()`.
The maintenance body is #3149's `runMaintenance` with `persist` removed.

### Preflight

`apps/switchboard/src/pglite-preflight.ts`, called from `initServer` for
each entry of `pgliteDirs` in this order:

1. `assertNoOrphanedSibling(dir)`: when `dir` is missing but
   `${dir}.converting` or any `${dir}.backup-*` exists, throw. This is the
   non-atomic double-rename window of both the conversion and
   `migratePgliteDir`; an initdb here would silently start empty.
2. Remove `postmaster.pid` (debug log, no warning) and `pg_wal/xlogtemp.*`.
3. `convertSnapshotDir(dir)` when the mode is `nodefs` (below).
4. `readPgVersionFile(dir)`, then the existing `--migrate-pglite` branch.

Skipped entirely under `PH_FORCE_PG_VERSION` (dirs are wiped) and
`PH_PGLITE_IN_MEMORY`.

### Conversion

```ts
// packages/pglite-node/src/convert-snapshot-dir.ts
export async function convertSnapshotDir(
  dir: string,
  deps: {
    extractSnapshot: (snapshotPath: string, outDir: string) => Promise<void>; // from pglite-fs
    openForVerify: (major: number, dataDir: string) => Promise<{ close(): Promise<void> }>;
    logger: ILogger;
  },
): Promise<"converted" | "none">;
```

1. No `${dir}/snapshot.bin` → `"none"`.
2. `rm -rf ${dir}.converting`; `mkdir(…, 0o700)`. A leftover `.converting`
   beside an existing `dir` is a crashed earlier attempt and is discarded.
3. `extractSnapshot` writes every entry except `postmaster.pid`, then fsyncs
   each file and directory.
4. `readPgVersionFile(converting)`; null or unsupported → throw.
5. Verify: `openForVerify(major, converting)` runs `SELECT 1` on the
   matching module's stock NodeFS and closes; remove the `postmaster.pid` it
   leaves; assert no `snapshot.bin` inside. The handle must be closed before
   step 6 or Windows refuses the rename.
6. Swap: `rename(dir, ${dir}.backup-snapshot-<stamp>)`, then
   `rename(converting, dir)`.
7. Log the backup path and that it holds the last `snapshot.bin`.

Any failure before step 6 removes `.converting` and rethrows; the original
dir is untouched. A crash between the two renames is caught by
`assertNoOrphanedSibling` at the next boot.

reactor-api's own branch (no `pgliteFactory`, filesystem `dbPath`) runs the
same steps from `initializeDatabaseAndAnalytics`
(`packages/reactor-api/src/server.ts:~370`) before the first `getDbClient`,
which is synchronous and cannot host them. It verifies with the current
module only; a PG16 snapshot there throws, as reactor-api never opened
legacy dirs without Switchboard's factory.

### Rollback between layouts

A converted loose dir opened under `PH_PGLITE_FS=snapshot` takes
AtomicNodeFs's legacy path (`loadLegacyIntoMemfs`, which skips
`postmaster.pid`) and writes `snapshot.bin` beside the tree. Flipping back
to `nodefs` re-converts, because `snapshot.bin` is authoritative, and the
loose files it supersedes go to the backup dir. Either direction loses no
committed data; the operator deletes `*.backup-snapshot-*` once satisfied.

## Stages

One PR per stage, in order. Each stage is green on `check-windows.yml` as
well as the ubuntu matrix; NODEFS file locking and WAL segment recycling on
NTFS are otherwise untested.

**Stage 0 — decision record.** `docs/adr/0004-pglite-nodefs-over-atomic-snapshot.md`
(next after `0003`): the Evidence table, the fsync trade-off, decisions 1-2
and 6-9 above, and the two axes kept apart (app-crash durability, which
SIGKILL tests; power-loss durability, which only `fsync` gives). Names the
upstream gap (#1107) and the follow-ups under Out of scope. No code.
Exit: ADR merged. Rollback: none.

**Stage 1 — durable NodeFS behind `PH_PGLITE_FS=nodefs`.**
- New `packages/pglite-node`: `DurableNodeFs` (above), maintenance ported
  from `atomic-node-fs.ts:197-290`, `ERRNO_CODES` from
  `@electric-sql/pglite/basefs`. Plumbing: root `package.json` `build`,
  `test:ci`, `test:ci:platform` filters; `scripts/test-weights.json` and
  `scripts/test-weights.windows.json`;
  `test/e2e-utils/src/helpers/workspace.ts` `WORKSPACE_PUBLISH_PACKAGES`;
  `test/ph-lora/ph-lora-mapping.json`; `tsconfig.json` references in
  reactor, reactor-api, switchboard.
- `apps/switchboard/src/pglite-version.ts`: `loadNodeFsClass(major)`
  (`@electric-sql/pglite/nodefs` or `pglite-legacy-02/nodefs`).
- `apps/switchboard/src/config.ts`, `types.ts`: `pgliteFs`, `pgliteFsync`.
- `apps/switchboard/src/server.mts`: `createReactorKysely` and the
  read-model `pgliteFactory` (`:276-290`, `:916-931`) take the mode; under
  `nodefs` both construct `createDurableNodeFs(Base, dir, { fsync, logger,
  onAbort: (what) => triggerFatalShutdown("PGlite aborted", what) })`.
  `PGLITE_FLUSH_INTERVAL_MS` is read only under `snapshot`.
- `apps/switchboard/src/pglite-preflight.ts`: steps 1 and 2 of Preflight
  (conversion arrives in stage 2); the existing unlink loop at `:344-352`
  moves here and loses its warning.
- `packages/reactor-api/src/utils/db.ts:129`: under the env flag construct
  the durable fs with the current module; otherwise unchanged.
- `apps/switchboard/test/boot-unsupported-stored-documents.test.ts`:
  `seedStore` builds its store through the same mode the boot will use.
- Tests, `packages/pglite-node/test/`:
  `durable-node-fs.test.ts` "issues one fdatasync per commit with fsync on"
  and "issues none with fsync off" (injected `hostFs` counters), "routes a
  failing fdatasync to onAbort and leaves the instance closed" (injected
  ENOSPC; the store must not hang), "opens a PG16 dir over pglite-legacy-02"
  (verifies op1b on 0.2.17 or pins the stock fallback of decision 5);
  `crash-recovery.test.ts` with `crash-child.mts`: the child appends every
  acknowledged id to a side file, the parent SIGKILLs 1 ms and 50 ms into
  the loop, reopens, and asserts every acked id is present, under fsync on
  and off (today's test checks three baseline rows only);
  `maintenance.test.ts`: the five cases of
  `packages/pglite-fs/test/maintenance.test.ts` by name, with "runs VACUUM
  FULL once when the loaded snapshot is oversized" measured on `base/`.
  `apps/switchboard/test/pglite-preflight.test.ts`: removes
  `pg_wal/xlogtemp.*`, removes `postmaster.pid` without a warn call, refuses
  a missing dir with a `.converting` or `.backup-*` sibling.
- Exit: the tests above; switchboard and reactor suites green under both
  modes locally; `check-windows.yml` green with `pglite-node` in the
  platform shard. The PR body records measured tps for fsync on/off on
  0.3.15 and whether 0.2.17 took op1b.
- Rollback: unset the flag; nothing on disk changed.

**Stage 2 — startup conversion `snapshot.bin` → PGDATA.**
- `packages/pglite-fs/src/index.ts`: export `extractSnapshot(snapshotPath,
  outDir)`, a `node:fs` adapter over `restoreMemfs` that skips
  `postmaster.pid` and fsyncs what it wrote. Rebuild the dist; its `.d.ts`
  is stale today.
- `packages/pglite-node/src/convert-snapshot-dir.ts` (above);
  `apps/switchboard/src/pglite-preflight.ts` step 3, ordered before
  `readPgVersionFile`; `packages/reactor-api/src/server.ts`
  `initializeDatabaseAndAnalytics` runs it for the no-factory path.
- Tests. No committed PGDATA fixture: a real one is tens of MB. Snapshots
  are generated at test time through AtomicNodeFs, which stays available
  through stage 3. `packages/pglite-fs/test/streaming-snapshot.test.ts`:
  "extracts the fixture to disk as the deterministic tree" over
  `fixtures/deterministic-tree.v1.bin` and `legacy-serializer.ts`.
  `packages/pglite-node/test/convert-snapshot-dir.test.ts`: "converts a
  snapshot and opens it with no recovery" (seeded rows read back; backup dir
  holds `snapshot.bin`; converted dir holds none); "ignores stale loose files
  beside the snapshot" (a legacy-migrated dir with 100 loose rows and 1000
  snapshot rows reads 1000); "discards a leftover .converting"; "leaves the
  original untouched when verification fails"; "closes the verify handle
  before the swap" (passes on Windows). `apps/switchboard/test/pglite-preflight.test.ts`:
  "converts before detecting the major, so a PG16 snapshot is migrated"
  (snapshot generated with `pglite-legacy-02` + AtomicNodeFs, boot with
  `migratePglite: true`, assert `PG_VERSION` is 17 afterwards; today this
  logs "No PG_VERSION; skipping"); "boots a converted dir on the second
  start without converting again". `boot-unsupported-stored-documents.test.ts`
  seeds through AtomicNodeFs again and boots under `nodefs`: the conversion
  makes the layout mismatch disappear.
- Exit: the tests above; a manual run converting a real `.ph/` from a
  current `ph vetra` project, both dirs, with the backup paths in the PR.
- Rollback: `PH_PGLITE_FS=snapshot` reopens the converted dir through
  AtomicNodeFs's legacy path (Rollback between layouts); or restore the
  `*.backup-snapshot-*` dir by rename.

**Stage 3 — flip the default.**
- `apps/switchboard/src/config.ts`: `pgliteFs` defaults to `nodefs`;
  `snapshot` logs a deprecation warning naming this release as the last;
  `PGLITE_FLUSH_INTERVAL_MS` set under `nodefs` warns. reactor-api's
  default branch flips the same way.
- `packages/reactor/test/factories.ts`: `atomicNodeFsBackend` becomes
  `nodeFsBackend`: one migrated loose template dir per worker, `fsp.cp`'d
  into a fresh tempdir per test; `TestFsBackend.fs` widens to
  `PGliteOptions["fs"]`; `testFsBackends` lists `MemoryFS` and `NodeFS`.
- `packages/reactor-api/test/db-client-sharing.test.ts`,
  `scripts/profiling/reactor-direct.ts:619`: durable NodeFS.
- Comments that describe the old failure mode:
  `apps/switchboard/src/fatal-shutdown.mts:21`,
  `apps/switchboard/src/pglite-dialect.ts:5-9`,
  `test/test-connect/src/run-integration.ts:239-242`,
  `packages/reactor-browser/vitest.config.ts:10`.
- `apps/academy/docs/academy/03-Build/05-Launch/05-DockerDeployment.md:237-253`:
  the layout (loose PGDATA, backups to delete), `PH_PGLITE_FS`,
  `PH_PGLITE_FSYNC`, `PGLITE_FLUSH_INTERVAL_MS` deprecated. There is no other
  AtomicNodeFs or `snapshot.bin` prose in academy.
- `RELEASE-NOTES.md`: layout change, automatic conversion and its backup
  dir, the fsync default and how to turn it off, the ENOSPC change (a full
  disk now aborts the store and the process exits through the fatal-shutdown
  path instead of a flush error), the one-release `snapshot` escape hatch.
  Per-package CHANGELOGs are generated by nx release.
- `scripts/test-weights.windows.json`: lower `switchboard` and `pglite-fs`
  after the Windows runner stops snapshotting.
- Exit: full `test:ci` and `check-windows.yml` green; a scripted
  `kill -9` run of the real Switchboard (the harness from experiment 10) that also
  writes read-storage rows through the attachments or permissions API,
  because the crash experiments never exercised that store's write path;
  result in the PR.
- Rollback: `PH_PGLITE_FS=snapshot` for the release; the data path is the
  one in Rollback between layouts.

**Stage 4 — remove pglite-fs, one release later.**
- Delete `packages/pglite-fs`; drop it from root `build`, `test:ci`,
  `test:ci:platform`, both weight files, `WORKSPACE_PUBLISH_PACKAGES`,
  `ph-lora-mapping.json`, and from the `package.json` and `tsconfig.json`
  of reactor, reactor-api, switchboard, `scripts/profiling`.
- Remove the `snapshot` branches in `server.mts` and `db.ts`,
  `PH_PGLITE_FS`, `PGLITE_FLUSH_INTERVAL_MS`, `onPgliteFlushError`, and
  `convertSnapshotDir` with its `extractSnapshot` dependency. The preflight
  keeps one check: a `snapshot.bin` in a store dir throws, naming the last
  version that converted it.
- `npm deprecate @powerhousedao/pglite-fs` after the release publishes; a
  manual step for the releaser, noted in `RELEASE-NOTES.md`.
- Downstream: the consuming repo's
  `patches/@powerhousedao__pglite-fs@6.2.3-dev.31.patch` (its timer VACUUM
  aborts open Kysely transactions) is dropped with the dependency. This
  monorepo's `patches/` holds only `cmd-ts@0.15.0.patch`.
- Exit: `pnpm build`, `test:ci`, `check-windows.yml` green; `grep -r
  AtomicNodeFs` finds only `RELEASE-NOTES.md` and this plan.
- Rollback: revert the PR; the previous release still converts.

## Risks

- **Power loss with `PH_PGLITE_FSYNC=0`.** No WAL-versus-heap ordering on
  disk; an OS crash can leave a torn dir. Documented as the cost of the flag.
  With the default on, durability is per commit and strictly better than
  today's.
- **Emscripten glue monkeypatching.** op1b replaces an import by name and a
  stream op by object path. A PGlite bump can move either; the stage 1 unit
  test (one fdatasync per commit) is the tripwire, and `init` throws when
  `instantiateWasm` is absent rather than silently running unsynced.
- **PG16 over 0.2.17.** Unverified for op1b; decision 5 names the fallback.
- **Windows.** NODEFS locking and WAL recycling untested there; the verify
  handle must be closed before the swap; `fs.fsyncSync` maps to
  `FlushFileBuffers`. `check-windows.yml` gates every stage.
- **Read-storage write path.** Crash experiments only reopened it; stage 3's
  exit run writes to it.
- **Reopen time after a crash** scales with un-checkpointed WAL. The 5-minute
  maintenance CHECKPOINT bounds it; a store killed repeatedly inside the
  interval replays up to that much WAL each time.
- **Fixed wasm pid.** `pg_wal/xlogtemp.42` can survive a close and block the
  next open; the preflight removes it.
- **ENOSPC.** Today a full disk is a flush error latched to a fatal
  shutdown. After stage 1 it is a Postgres PANIC → wasm abort → `onAbort` →
  fatal shutdown. Same outcome, different signal; the stage 1 test pins it.
- **Shutdown stall.** 10.3 s between "Received SIGTERM" and "WebSocket
  server closed" (`packages/reactor-api/src/graphql/graphql-manager.ts:1063`),
  upstream of store close. Not caused by storage; follow-up below.
- **0.5.8 fsync cost.** 8.4 ms per sync versus 1.2 ms on 0.3.15. Revisit the
  default at the PG18 upgrade; `startParams` without `-F` plus
  `wal_sync_method=fsync` is the alternative there.

## Out of scope

- SQLite, dual dialects, embedded-postgres: separate research.
- Connect and the browser (`idb://`, IdbFs) are unchanged.
- The upstream fix for #1107 (a NODEFS `fsync` stream op and a real
  `__syscall_fdatasync`). Stage 0 files or upvotes the issue and links this
  plan; the subclass is removed when a pinned PGlite ships the fix.
- The 10 s SIGTERM stall in graphql-manager shutdown: its own investigation.
- A lock file for multi-instance detection (decision 10).
- `commitOperations` batching in `document-view.ts`, parked in #3149.

## Conventions for implementing agents

- `pnpm` only; `pnpm tsc --build`, never a global `tsc`. Packages build with
  tsdown; `pglite-node` copies `packages/pglite-fs/tsdown.config.ts`.
- Rebuild `packages/pglite-fs` and `packages/pglite-node` dists before
  running switchboard or reactor-api tests; they consume the built output.
- Granular try/catch around the single await that can fail. Comments terse
  and rare. Reducers apply or derive state; never describe them as folding.
- Run `vitest` through the package's `pnpm test`; a stage is green only on
  the real `test:ci` and `check-windows.yml` runs.
- Commit per logical change with a body that says why; end with the
  attribution line the session provides. Never amend, rebase or force-push.
- A red test stays red until its cause is fixed. No retries to get green.
- Record every deviation from this plan in the PR body with file:line and
  the reason. Do not edit the plan to match the code; propose the change.
