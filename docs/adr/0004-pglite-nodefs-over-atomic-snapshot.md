# ADR 0004 — PGlite on NodeFS instead of the AtomicNodeFs snapshot

- **Status:** Accepted
- **Date:** 2026-10-01
- **Deciders:** thegoldenmule
- **Implemented by:** branch `feat/retire-atomic-node-fs`
- **Implementation notes:** the subclass, conversion, preflight and test plan
  are in `docs/plans/2026-10-01-retire-atomic-node-fs.md`.

## Context

Switchboard and `ph vetra` store the reactor (`./.ph/reactor-storage`) and the
read models (`./.ph/read-storage`) in PGlite. Since 2026-05-13 (736ae675b0)
both dirs are opened through `AtomicNodeFs` (`@powerhousedao/pglite-fs`): a
`MemoryFS` subclass that holds PGDATA in memory and, on every `syncToFs`,
serializes the whole tree into one `snapshot.bin` (write, fsync, rename).

AtomicNodeFs was added because PGlite data dirs became unopenable after
crashes. The corruption was observed while Switchboard opened three PGlite
instances on one data dir. That cause was removed on 2026-05-19 (8a8030ee09,
the `getDbClient` cache). No single-instance repro of stock-NodeFS corruption
ever existed.

The snapshot has costs that no option changes:

- Every flush is O(database size). Switchboard runs `flushIntervalMs=100`;
  reactor-api's own PGlite branch passes no options and snapshots on every
  statement.
- The deferred flush loses every acknowledged commit since the last completed
  snapshot on any crash: at least 100 ms plus one full-tree write.
- The deferred timer starves under a hot writer; PGlite's query path never
  yields to the event loop.
- Nothing reads `snapshot.bin`: no `pg_dump`, no explorer, no CLI.
- A snapshot dir has no loose `PG_VERSION`, so `migratePgliteDir` logs
  "No PG_VERSION; skipping" and a PG16 store silently skips the major upgrade.

Stock `NodeFS` (`@electric-sql/pglite/nodefs`) keeps a real PGDATA on disk and
lets Postgres run its own crash recovery.

### Two durability axes

- **App-crash durability:** every acknowledged commit survives the process
  dying (SIGKILL, OOM, panic). Postgres gives this through WAL recovery as
  long as writes reach the OS page cache in order. The SIGKILL experiments
  below measure this axis.
- **Power-loss durability:** every acknowledged commit is on the device before
  the ack. Only `fsync` gives this. An OS crash or power loss with fsync off
  can leave a torn dir.

### Evidence

Experiments run 2026-10-01 against PGlite 0.3.15 (the repo pin) and 0.5.8.

| Question | Result |
|---|---|
| Does stock NodeFS corrupt on SIGKILL? | No. 92 cycles on macOS (0.3.15 and 0.5.8) + 22 on Linux (node:24, overlayfs), one instance per dir, dirs to 2.7 GB, up to 309 MB unreplayed WAL, kills mid-CHECKPOINT and mid-VACUUM: 0 unopenable dirs, 0 lost acknowledged commits. Every reopen ran normal Postgres recovery. |
| Real Switchboard on NodeFS? | 11 `kill -9` + 2 SIGTERM under 4 concurrent GraphQL writers: 4,509 acked writes, 0 lost; both stores reopened every time. Reactor suite: 0 NodeFS-specific failures. Switchboard suite 498 of 501; 2 of the 3 failures seed through AtomicNodeFs while booting under NodeFS. |
| Throughput (10-row txn/s, NodeFS vs AtomicNodeFs) | 10 MB: 1570 vs 21. 200 MB: 1123 vs 2.6. 1 GB: 938 vs 0.6. |
| Cold open | NodeFS 110-150 ms at every size. AtomicNodeFs 0.44 s / 1.4 s / 7.7 s at 10 MB / 200 MB / 1 GB. |
| Reopen after crash | ~2.3 ms per MB of un-checkpointed WAL (954 MB → 2.4 s). A CHECKPOINT before the kill → 0.21 s. |
| Does NodeFS fsync? | No. Emscripten NODEFS has no `fsync` stream op and `__syscall_fdatasync` is `return 0`; `strace` saw 0 sync syscalls over thousands of commits. 0.3.15 reports `fsync=on` and believes it; 0.5.8 starts with `-F`. Upstream: electric-sql/pglite#1107. Stock NodeFS is app-crash durable, not power-loss durable. |
| Can a subclass fsync? | Yes. Patch `FS.filesystems.NODEFS.stream_ops.fsync` and replace the `__syscall_fdatasync` import with `fs.fdatasyncSync(stream.nfd)`: 1 device sync per commit on 0.3.15 and 0.5.8. Throughput 1195 → 440-560 tps on 0.3.15 (160 on 0.5.8, cause unknown); still 20x AtomicNodeFs at 10 MB. Fsyncing in `syncToFs` instead costs 43 syncs per commit and leaves `base/*` unsynced. |
| snapshot.bin → PGDATA? | `restoreMemfs` needs only `analyzePath/mkdir/chmod/writeFile`, so a ~25-line `node:fs` adapter converts a 163 MB snapshot in 182 ms, byte-exact on 12 probes; the result opens with a clean shutdown checkpoint. NodeFS silently opens stale loose files left beside a `snapshot.bin`. |
| Incidental | PGlite leaves `postmaster.pid` after a clean `close()`, so the preflight's "Removed stale PGLite lockfile" warning fires on every boot. One `pg_wal/xlogtemp.42: File exists` on a fresh open right after a clean close (fixed wasm pid). |

## Decision

### 1. NodeFS is the default, in one PR

No `PH_PGLITE_FS` flag, no snapshot fallback, no deprecation release. A dual
mode would need the stale-files hazard handled in both directions for a
release nobody would run. The conversion is idempotent and the downgrade path
exists without it: a converted dir is a plain PGDATA, which the previous
release's AtomicNodeFs imports through its legacy path on first open.

### 2. Fsync on by default; one escape hatch, `PH_PGLITE_FSYNC=0`

The subclass over `NodeFS` makes every commit power-loss durable before the
ack and stays 20x faster than today. AtomicNodeFs in Switchboard's
configuration loses the last ≥100 ms of acknowledged commits on every crash
and fsyncs only completed snapshots. `PH_PGLITE_FSYNC=0` drops the store to
app-crash durability. The knob exists because the stream-op patch also makes
initdb's final fsync pass real, and the test suites boot dozens of fresh
stores per run on a Windows runner that is already the slowest shard. The
subclass goes when a pinned PGlite ships a NODEFS `fsync` stream op and a real
`__syscall_fdatasync` (electric-sql/pglite#1107; upvote it or file the fix).

### 3. ENOSPC is a fatal shutdown through `onAbort`

`onFlushError → triggerFatalShutdown` has no equivalent on NodeFS. A failed WAL
write or fdatasync is a Postgres PANIC, which in wasm is an Emscripten abort.
The subclass routes `emscriptenOpts.onAbort` to a caller hook; Switchboard
wires it to `triggerFatalShutdown`. Same outcome as today, different signal.

### 4. `snapshot.bin` present means AtomicNodeFs store, and authoritative

Conversion never trusts loose files beside a snapshot, never writes into the
existing dir, and deletes the old dir only after the converted one has been
opened and checked.

### 5. Conversion is a layout change, not a major change

It runs for every PGlite dir, without `--migrate-pglite`, before
`readPgVersionFile`/`migratePgliteDir`, with the major read from the
snapshot's own `PG_VERSION` entry. That order fixes the silent PG16 skip.

### 6. No retained backup

The conversion is byte-exact, so the converted dir holds the same bytes
AtomicNodeFs would have loaded into MEMFS. A backup would protect against
nothing the verify step does not check, and it would double the disk
footprint of every store at the moment the disk is most likely to be tight.
The sequence is crash-safe through sibling dirs and renames instead.

## Consequences

### Positive

- Writes are 20x faster with fsync on at 10 MB (the only size measured with
  fsync on) and 75x to 1500x faster with fsync off from 10 MB to 1 GB; cold
  open is ~0.1 s instead of growing with the store.
- With the default on, durability is per commit before the ack. Today's
  design loses at least 100 ms of acknowledged commits on every crash.
- PGDATA on disk is readable by standard tooling.
- PG16 snapshot stores migrate under `--migrate-pglite` instead of silently
  skipping.
- `@powerhousedao/pglite-fs` is deleted; the durable subclass and the
  conversion live in reactor-api, the only consumer besides Switchboard.

### Negative / risks

- The old snapshot is deleted after verification. A corrupt-but-openable
  snapshot that passes verification is unrecoverable from this process. The
  verify step compares the `pg_control` system identifier and reads every user
  table end to end, which fails on a torn heap page where `SELECT 1` would not.
- `PH_PGLITE_FSYNC=0` trades power-loss durability for throughput; documented
  as the cost of the knob.
- The subclass patches Emscripten glue by import name and object path. A
  PGlite bump can move either; the one-fdatasync-per-commit test is the
  tripwire, and `init` throws when `instantiateWasm` is absent rather than
  running unsynced.
- Reopen after a crash replays un-checkpointed WAL; the periodic CHECKPOINT
  bounds it.
- Conversion needs free space for one extra copy of the store.
- NODEFS locking and WAL recycling on NTFS are untested beyond the Windows CI
  workflow.

### Confidence and revisit

Confidence is high on the repo pin: 114 SIGKILL cycles and 13 real Switchboard
kills lost nothing, and the fsync patch was verified with `strace`. Revisit at
the PG18 / PGlite 0.5.x upgrade, where one fdatasync costs 8.4 ms instead of
1.2 ms (`startParams` without `-F` plus `wal_sync_method=fsync` is the
alternative there), and when upstream closes #1107.

## Alternatives considered

- **Keep AtomicNodeFs.** Its reason to exist (multi-instance corruption) was
  fixed separately; its costs scale with store size and it hides a PG16
  migration bug.
- **Dual mode behind `PH_PGLITE_FS`.** Needs the stale-files hazard handled in
  both directions and a deprecation release nobody would run; rejected
  (decision 1).
- **Fsync off by default.** Faster, but a regression against the old design's
  power-loss story for completed snapshots; rejected, kept as the knob
  (decision 2).
- **Fsync inside `syncToFs`.** 43 syncs per commit and `base/*` stays
  unsynced; the stream-op and syscall patch is the only place that gives one
  sync per commit.
- **Keep a backup of the snapshot after conversion.** Doubles the footprint
  at the worst moment and protects against nothing the verify step misses
  (decision 6).
- **Trust loose files beside `snapshot.bin`.** They are stale remnants of the
  legacy import; NodeFS opens them silently (decision 4).
- **Convert only under `--migrate-pglite`.** Leaves the PG16 skip in place for
  every operator who never passes the flag (decision 5).
- **Wait for upstream #1107.** No timeline; the subclass is removable when it
  lands.
