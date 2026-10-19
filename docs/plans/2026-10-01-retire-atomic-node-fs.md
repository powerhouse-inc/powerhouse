# Plan: Retire AtomicNodeFs for PGlite's NodeFS

Date: 2026-10-01 (against `main` at f488457d12, after PR #3149)
Status: proposal, not started. Written for agents implementing from `main`.
Paths are relative to the repo root. One PR; no flag, no dual mode.

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
| Can a subclass fsync? | Yes ("op1b"): patch `FS.filesystems.NODEFS.stream_ops.fsync` and replace the `__syscall_fdatasync` import with `fs.fdatasyncSync(stream.nfd)`. 1 device sync per commit on 0.3.15 and 0.5.8. Throughput 1195 → 440-560 tps on 0.3.15 (160 on 0.5.8, cause unknown). Still 20x+ AtomicNodeFs at 10 MB; fsync throughput at larger sizes was not measured. Fsyncing in `syncToFs` instead is slow (43 syncs/commit) and leaves `base/*` unsynced. |
| snapshot.bin → PGDATA? | `restoreMemfs` needs only `analyzePath/mkdir/chmod/writeFile`, so a ~25-line `node:fs` adapter converts a 163 MB snapshot in 182 ms, byte-exact on 12 probes; the result opens with a clean shutdown checkpoint. Stale-loose-files hazard reproduced: NodeFS silently opens the stale tree beside `snapshot.bin`. |
| Incidental | PGlite leaves `postmaster.pid` behind after a clean `close()` (NodeFS `closeFs` is `FS.quit()`), so the preflight's "Removed stale PGLite lockfile" warning fires on every boot. One `could not create file "pg_wal/xlogtemp.42": File exists` on a fresh open right after a clean close (PGlite's fixed wasm pid). SIGTERM under load fired in 22 ms, but total shutdown took 10.3 s upstream of store close. |

## Decisions

1. **NodeFS is the default now, in one PR.** No `PH_PGLITE_FS` flag, no
   snapshot fallback, no deprecation release. A dual mode would need the
   stale-files hazard handled in both directions for a release nobody would
   run; the migration below is idempotent and the downgrade path exists
   without it (Rollback).
2. **Fsync on by default; one escape hatch, `PH_PGLITE_FSYNC=0`.** In
   Switchboard's configuration AtomicNodeFs loses the last ≥100 ms of
   acknowledged commits on every crash and fsyncs only completed snapshots.
   op1b is durable before ack on every commit and still 20x faster than
   today. The knob stays because the stream-op patch also makes initdb's
   final fsync pass real, and the test suites boot dozens of fresh stores
   per run on a Windows runner that is already the slowest shard; it is one
   env read, documented as "power-loss durability off". The 0.5.8 cost
   (8.4 ms per sync) is a risk for the PG18 upgrade, not for the repo pin.
3. **No new package.** The shared code is the durable subclass, the
   maintenance and the conversion, and its only consumers are reactor-api's
   own PGlite path and Switchboard, which already depends on reactor-api.
   Reactor's test factories use `NodeFS` from `@electric-sql/pglite/nodefs`
   directly. A package exists to be depended on by something that cannot
   depend on reactor-api; nothing is left in that position. The code lives
   in `packages/reactor-api/src/pglite/` behind a subpath export
   `@powerhousedao/reactor-api/pglite-node`, beside the existing
   `/https-hooks` and `/vite` exports. `packages/pglite-fs` is deleted in
   the same PR; the published `@powerhousedao/pglite-fs` versions stay on
   npm (optional manual `npm deprecate`).
4. **Maintenance stays inside the filesystem object.** PR #3149's periodic
   VACUUM then CHECKPOINT moves into the subclass with the same lifecycle
   (`initialSyncFs` schedules, `closeFs` cancels and awaits the pass) and the
   same `_runExclusiveQuery` + ReadyForQuery guard. On NodeFS the CHECKPOINT
   is what bounds reopen time after a crash. `vacuumFullAboveBytes` is
   measured against the size of `base/` at open.
5. **The subclass is built over the loaded module's `NodeFS`.** Switchboard
   opens PG16 dirs with `pglite-legacy-02` (0.2.17) until `--migrate-pglite`
   runs. op1b was verified on 0.3.15 and 0.5.8 only; the PR verifies 0.2.17
   or declares PG16 dirs stock-NodeFS (app-crash durable) until migrated.
6. **ENOSPC becomes a fatal shutdown through `onAbort`.** `onFlushError →
   triggerFatalShutdown` has no equivalent on NodeFS. A failed WAL write or
   fdatasync is a Postgres PANIC, which in wasm is an Emscripten abort; the
   subclass routes `emscriptenOpts.onAbort` to a caller hook and Switchboard
   wires it to `triggerFatalShutdown`. Verified with an injected failing
   `fdatasyncSync`.
7. **`snapshot.bin` present means AtomicNodeFs store, and authoritative.**
   Conversion never trusts loose files beside a snapshot, never writes into
   the existing dir, and deletes the old dir only after the converted one
   has been opened and checked.
8. **Conversion is a layout change, not a major change.** It runs for every
   PGlite dir, without `--migrate-pglite`, and before
   `readPgVersionFile`/`migratePgliteDir`, with the major read from the
   snapshot's own `PG_VERSION` entry. That order fixes the PG16-snapshot bug.
9. **No retained backup.** The conversion is byte-exact, so the converted
   dir holds the same bytes AtomicNodeFs would have loaded into MEMFS; a
   backup would protect against nothing the verify step does not check, and
   it would double the disk footprint of every store at the one moment the
   disk is most likely to be tight. The sequence is crash-safe through
   renames instead (Conversion).
10. **Single-instance guard is the existing `getDbClient` cache.** No lock
    file; multi-instance on one dir remains unsupported, as today.
11. **Connect is untouched.** `idb://` and the browser build are out of scope.

## Design

### The durable NodeFS

```ts
// packages/reactor-api/src/pglite/durable-node-fs.ts
export interface DurableNodeFsOptions {
  fsync?: boolean;                 // default true; PH_PGLITE_FSYNC=0 → false
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

`ERRNO_CODES` comes from `@electric-sql/pglite/basefs`. `initialSyncFs`
measures `base/` and schedules maintenance; `closeFs` cancels the timer,
awaits an in-flight pass, then calls `super.closeFs()`. The maintenance
body is #3149's `runMaintenance` (`atomic-node-fs.ts:197-290`) with
`persist` removed.

### Preflight

`apps/switchboard/src/pglite-preflight.ts`, called from `initServer` for
each entry of `pgliteDirs` (`server.mts:338-352` today), in this order:

1. `recoverConversion(dir)` and `convertSnapshotDir(dir)` (below).
2. Remove `postmaster.pid` (debug log, no warning) and `pg_wal/xlogtemp.*`.
3. `readPgVersionFile(dir)`, then the existing `--migrate-pglite` branch.

Skipped under `PH_FORCE_PG_VERSION` (dirs are wiped) and
`PH_PGLITE_IN_MEMORY`. reactor-api's own path (no `pgliteFactory`,
filesystem `dbPath`) runs steps 1 and 2 from
`initializeDatabaseAndAnalytics` (`packages/reactor-api/src/server.ts:~370`)
before the first `getDbClient`, which is synchronous and cannot host them.

### Conversion

```ts
// packages/reactor-api/src/pglite/convert-snapshot-dir.ts
export interface ConversionDeps {
  // Opens `dataDir` with the stock NodeFS of the module for `major`.
  openForVerify: (major: number, dataDir: string) => Promise<VerifyHandle>;
  logger: ILogger;
}
export async function recoverConversion(dir: string, deps: ConversionDeps): Promise<void>;
export async function convertSnapshotDir(dir: string, deps: ConversionDeps): Promise<"converted" | "none">;
```

Siblings: `${dir}.converting` (extraction target) and `${dir}.old` (the
AtomicNodeFs dir between swap and delete). The snapshot is read by
`extractSnapshot(snapshotPath, outDir)` in `snapshot-reader.ts`, the
`node:fs` adapter over the former `restoreMemfs` (chunked reader, magic and
version check, `dirMode`), which skips `postmaster.pid`, returns the
`PG_VERSION` entry and the `global/pg_control` bytes, and fsyncs every file
and directory it wrote.

`convertSnapshotDir`, when `${dir}/snapshot.bin` exists:

- (a) `rm -rf ${dir}.converting`; `mkdir(…, 0o700)`; extract.
- (b) Verify: `openForVerify(major, converting)` where `major` is the
  snapshot's `PG_VERSION` entry (unsupported → throw); then
  `SELECT system_identifier FROM pg_control_system()` must equal the
  identifier parsed from the extracted `pg_control` bytes; then
  `SELECT count(*)` over every table in `pg_tables` outside `pg_catalog` and
  `information_schema` (a full heap read of every user table, including the
  reactor migration ledger and `Operation`; one-time, seconds per GB); close;
  remove the `postmaster.pid` the close leaves; assert no `snapshot.bin`
  inside. The handle must be closed before (c) or Windows refuses the rename.
- (c) `rename(dir, ${dir}.old)`.
- (d) `rename(converting, dir)`.
- (e) `rm -rf ${dir}.old` (`maxRetries` for Windows handle release).
- Log one info line: dir, snapshot bytes, converted bytes, entries, duration.

Any failure before (c) removes `.converting` and rethrows; the original dir
is untouched.

`recoverConversion` runs first at every boot and makes the sequence
idempotent across any interruption:

| On disk | Meaning | Action |
|---|---|---|
| `dir` with `snapshot.bin`, `.converting` present | died in (a) or (b) | `rm -rf .converting`; convert again |
| `dir` with `snapshot.bin`, `.old` present | `.old` is a superseded pre-conversion tree from a run whose (d) completed before a downgrade re-snapshotted `dir` | `rm -rf .old`; convert |
| `dir` missing, `.converting` present | died between (c) and (d) | (d), then (e) if `.old` exists |
| `dir` present without `snapshot.bin`, `.old` present | died between (d) and (e) | (e) |
| `dir` missing, `.converting` missing, `.old` present | cannot happen by this sequence | throw; operator inspects |
| `dir` missing, no siblings | fresh install | nothing; PGlite initdbs |

Never initdb when `dir` is missing but a `.converting` or `.old` sibling
exists; the table above either completes the swap or throws.

### Rollback

Revert the PR. A converted dir is a plain PGDATA; the previous release's
AtomicNodeFs takes its legacy path (`loadLegacyIntoMemfs`, which skips
`postmaster.pid`) on first open and writes `snapshot.bin` beside the tree.
No backup is needed for the downgrade. Running the new release again
afterwards converts once more, because `snapshot.bin` is authoritative.
`.ph/` is also under the operator's own backup regime, as before.

## The change

One PR, in these commits:

1. **ADR.** `docs/adr/0004-pglite-nodefs-over-atomic-snapshot.md`: the
   Evidence table, decisions 1, 2, 6-9, the two durability axes (app-crash,
   which SIGKILL tests; power-loss, which only fsync gives), upstream #1107.
2. **Durable NodeFS and maintenance.** `packages/reactor-api/src/pglite/`:
   `durable-node-fs.ts`, `maintenance.ts` (ported from `atomic-node-fs.ts`),
   `index.ts`; subpath export `./pglite-node` in `packages/reactor-api/package.json`
   and `tsdown.config.ts`. `PH_PGLITE_FSYNC` read in one place,
   `resolvePgliteFsync(env)`.
3. **Conversion.** `snapshot-reader.ts` (`extractSnapshot`, moved from
   `restoreMemfs` with `fixtures/deterministic-tree.v1.bin` and
   `legacy-serializer.ts` carried into `packages/reactor-api/test/pglite/`),
   `convert-snapshot-dir.ts` (`recoverConversion`, `convertSnapshotDir`).
4. **reactor-api wiring.** `src/utils/db.ts:129`: the no-factory branch
   constructs `createDurableNodeFs(NodeFS, connectionString, { fsync,
   logger })`. `src/server.ts` `initializeDatabaseAndAnalytics`: preflight
   steps 1-2 with `openForVerify` over the current module only (a PG16
   snapshot there throws; reactor-api never opened legacy dirs without
   Switchboard's factory). Drop the `@powerhousedao/pglite-fs` dependency.
5. **Switchboard wiring.** `src/pglite-version.ts`: `loadNodeFsClass(major)`
   (`@electric-sql/pglite/nodefs` or `pglite-legacy-02/nodefs`) and
   `openForVerify`. `src/pglite-preflight.ts` as above; `server.mts:344-352`
   unlink loop moves there. `createReactorKysely` (`:276-290`) and the
   read-model `pgliteFactory` (`:916-931`) construct the durable fs with
   `onAbort: (what) => triggerFatalShutdown("PGlite aborted", what)`; remove
   `PGLITE_FLUSH_INTERVAL_MS` (warn once if set), `onPgliteFlushError`, the
   `AtomicNodeFs` import. Comments at `fatal-shutdown.mts:21` and
   `pglite-dialect.ts:5-9` describe the old failure mode; rewrite them.
   `ph vetra` and `ph switchboard` call `startSwitchboard` in-process
   (`clis/ph-cli/src/services/switchboard.ts:128`) and need no change.
6. **Delete `packages/pglite-fs`.** Remove it from root `package.json`
   `build`, `test:ci`, `test:ci:platform`; `scripts/test-weights.json` and
   `scripts/test-weights.windows.json`;
   `test/e2e-utils/src/helpers/workspace.ts` `WORKSPACE_PUBLISH_PACKAGES`;
   `test/ph-lora/ph-lora-mapping.json`; `package.json` and `tsconfig.json`
   references in `packages/reactor`, `packages/reactor-api`,
   `apps/switchboard`, `scripts/profiling`; the comment in
   `packages/reactor-browser/vitest.config.ts:10`; `pnpm-lock.yaml`.
7. **Tests and fixtures elsewhere.** `packages/reactor/test/factories.ts`:
   `atomicNodeFsBackend` → `nodeFsBackend` (`new NodeFS(tmpdir)` from
   `@electric-sql/pglite/nodefs`; one migrated template dir per worker,
   `fsp.cp`'d per test); `TestFsBackend.fs` widens to `PGliteOptions["fs"]`;
   `testFsBackends` lists `MemoryFS` and `NodeFS`.
   `packages/reactor-api/test/db-client-sharing.test.ts` and
   `scripts/profiling/reactor-direct.ts:619`: durable NodeFS.
   `apps/switchboard/test/boot-unsupported-stored-documents.test.ts`
   `seedStore` seeds through `NodeFS`. `test/test-connect/src/run-integration.ts:239-242`:
   rewrite the comment (keep `PH_PGLITE_IN_MEMORY`).
8. **Docs.** `apps/academy/docs/academy/03-Build/05-Launch/05-DockerDeployment.md:237-253`:
   the loose-PGDATA layout, automatic one-time conversion, `PH_PGLITE_FSYNC`,
   `PGLITE_FLUSH_INTERVAL_MS` removed. No other academy page mentions
   AtomicNodeFs or `snapshot.bin`. `RELEASE-NOTES.md`: the layout change and
   that the old snapshot is deleted after verification; the fsync default and
   the knob; the ENOSPC change (a full disk aborts the store and the process
   exits through the fatal-shutdown path instead of a flush error); the
   downgrade path; the optional `npm deprecate @powerhousedao/pglite-fs`.
   Per-package CHANGELOGs are generated by nx release.

## Tests

Snapshots for tests are generated at test time: a store is created with
stock NodeFS, closed, and its loose tree serialized by a test-only
`snapshot-writer.ts` (the former `collectEntries` + `writeEntries` over
`node:fs`, ~80 lines) into `snapshot.bin`. That produces real snapshots of
any major without the old class. `fixtures/deterministic-tree.v1.bin` with
`legacy-serializer.ts` covers the byte level.

`packages/reactor-api/test/pglite/`:

- `durable-node-fs.test.ts`: "issues one fdatasync per commit with fsync
  on", "issues none with fsync off" (injected `hostFs` counters); "routes a
  failing fdatasync to onAbort and leaves the instance closed" (injected
  ENOSPC; the store must not hang); "opens a PG16 dir over pglite-legacy-02"
  (in switchboard's suite; verifies op1b on 0.2.17 or pins the stock fallback
  of decision 5).
- `crash-recovery.test.ts` + `crash-child.mts`: the child appends every
  acknowledged id to a side file; the parent SIGKILLs 1 ms and 50 ms into the
  loop, reopens, asserts every acked id present; under fsync on and off.
  Today's test (`packages/pglite-fs/test/crash-recovery.test.ts`) checks
  three baseline rows only.
- `maintenance.test.ts`: the five cases of
  `packages/pglite-fs/test/maintenance.test.ts` by name, "runs VACUUM FULL
  once when the loaded snapshot is oversized" measured on `base/`.
- `snapshot-reader.test.ts`: "extracts the fixture to disk as the
  deterministic tree", "rejects a truncated snapshot", "rejects a bad magic",
  "skips postmaster.pid".
- `convert-snapshot-dir.test.ts`: "converts a snapshot, deletes the old dir,
  opens with no recovery" (seeded rows read back; no `.old`, no
  `.converting`, no `snapshot.bin`); "ignores stale loose files beside the
  snapshot" (loose tree with 100 rows, snapshot with 1000 → reads 1000);
  "leaves the original untouched when verification fails" (identifier
  mismatch injected through `openForVerify`); "closes the verify handle
  before the swap"; one case per row of the recovery table, each built by
  running the real sequence and killing it (a `ConversionDeps` hook that
  throws after a named step) then booting again; "refuses to initdb beside
  an orphaned sibling".

`apps/switchboard/test/pglite-preflight.test.ts`: "converts before
detecting the major, so a PG16 snapshot is migrated" (snapshot from
`pglite-legacy-02` + the writer; boot with `migratePglite: true`; assert
`PG_VERSION` is 17; today this logs "No PG_VERSION; skipping"); "boots a
converted dir on the second start without converting"; "removes
pg_wal/xlogtemp.*"; "removes postmaster.pid without a warn call"; "logs one
info line per converted dir with sizes and duration".

Windows: `reactor-api` and `switchboard` are already in `test:ci:platform`,
so `check-windows.yml` runs every test above. NODEFS file locking and WAL
segment recycling on NTFS are otherwise untested; the PR is not mergeable
with that workflow red.

## Exit criteria

- Every test above; `test:ci` and `check-windows.yml` green.
- `grep -r "AtomicNodeFs\|pglite-fs\|snapshot\.bin"` outside `docs/`,
  `RELEASE-NOTES.md` and the conversion code finds nothing.
- A manual run converting a real `.ph/` from a current `ph vetra` project,
  both dirs, with the info lines in the PR.
- A scripted `kill -9` run of the real Switchboard (the harness from
  experiment 10) that also writes read-storage rows through the attachments
  or permissions API, because the experiments only ever reopened that store;
  acked-versus-stored counts in the PR.
- Measured tps for fsync on and off on 0.3.15, and whether 0.2.17 took op1b.

## Risks

- **The old snapshot is deleted after verification.** A verification that
  passes on a corrupt-but-openable snapshot is unrecoverable from this
  process. Mitigation: the conversion is byte-exact, so the converted dir is
  the same data AtomicNodeFs would have loaded; the verify step checks the
  `pg_control` system identifier against the snapshot entry and reads every
  user table end to end, including the migration ledger and `Operation`,
  which fails on a torn heap page where a `SELECT 1` would not. A store that
  fails verification is left as it was and the boot fails with the reason.
- **Power loss with `PH_PGLITE_FSYNC=0`.** No WAL-versus-heap ordering on
  disk; an OS crash can leave a torn dir. Documented as the cost of the knob.
  With the default on, durability is per commit and strictly better than
  today's.
- **Emscripten glue monkeypatching.** op1b replaces an import by name and a
  stream op by object path. A PGlite bump can move either; the
  one-fdatasync-per-commit test is the tripwire, and `init` throws when
  `instantiateWasm` is absent rather than running unsynced.
- **PG16 over 0.2.17.** Unverified for op1b; decision 5 names the fallback.
- **Windows.** NODEFS locking and WAL recycling untested there; the verify
  handle must be closed before the swap; `rm` of `.old` needs retries;
  `fs.fsyncSync` maps to `FlushFileBuffers`. `check-windows.yml` gates.
- **Read-storage write path.** The experiments only reopened it; the exit
  run writes to it.
- **Reopen time after a crash** scales with un-checkpointed WAL. The 5-minute
  CHECKPOINT bounds it; a store killed repeatedly inside the interval replays
  up to that much WAL each time.
- **Fixed wasm pid.** `pg_wal/xlogtemp.42` can survive a close and block the
  next open; the preflight removes it.
- **ENOSPC.** Today a full disk is a flush error latched to a fatal
  shutdown. Now it is a Postgres PANIC → wasm abort → `onAbort` → fatal
  shutdown. Same outcome, different signal; the injected-ENOSPC test pins it.
  Conversion itself needs free space for one extra copy of the store.
- **Shutdown stall.** 10.3 s between "Received SIGTERM" and "WebSocket
  server closed" (`packages/reactor-api/src/graphql/graphql-manager.ts:1063`),
  upstream of store close. Not storage; follow-up below.
- **0.5.8 fsync cost.** 8.4 ms per sync versus 1.2 ms on 0.3.15. Revisit at
  the PG18 upgrade; `startParams` without `-F` plus `wal_sync_method=fsync`
  is the alternative there.

## Out of scope

- SQLite, dual dialects, embedded-postgres: separate research.
- Connect and the browser (`idb://`, IdbFs) are unchanged.
- The upstream fix for #1107 (a NODEFS `fsync` stream op and a real
  `__syscall_fdatasync`). The ADR files or upvotes the issue and links this
  plan; the subclass goes when a pinned PGlite ships the fix.
- The 10 s SIGTERM stall in graphql-manager shutdown: its own investigation.
- A lock file for multi-instance detection (decision 10).
- `commitOperations` batching in `document-view.ts`, parked in #3149.
- Downstream repos carrying `patches/@powerhousedao__pglite-fs@*.patch`
  drop it when they drop the dependency; this monorepo's `patches/` holds
  only `cmd-ts@0.15.0.patch`.

## Conventions for implementing agents

- `pnpm` only; `pnpm tsc --build`, never a global `tsc`. Packages build with
  tsdown.
- Rebuild `packages/reactor-api` before running switchboard tests; it
  consumes the built output.
- Granular try/catch around the single await that can fail. Comments terse
  and rare. Reducers apply or derive state; never describe them as folding.
- Run tests through the package's `pnpm test`; the PR is green only on the
  real `test:ci` and `check-windows.yml` runs.
- Commit per logical change with a body that says why; end with the
  attribution line the session provides. Never amend, rebase or force-push.
- A red test stays red until its cause is fixed. No retries to get green.
- Record every deviation from this plan in the PR body with file:line and
  the reason. Do not edit the plan to match the code; propose the change.
