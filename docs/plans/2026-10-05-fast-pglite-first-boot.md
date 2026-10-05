# Plan: Fast PGlite first boot

Date: 2026-10-05 (branch `feat/retire-atomic-node-fs` at c652928443)
Status: implemented in the same PR as the AtomicNodeFs retirement.
Companion to: [Retire AtomicNodeFs](2026-10-01-retire-atomic-node-fs.md),
ADR 0004 (amended). Paths are relative to the repo root. One change, no flag.

## Problem

The durable NodeFS makes every host `fsync`/`fdatasync` real. That is the
point for live commits (one `fdatasync` per commit) and for CHECKPOINT. It
is also paid, for nothing, by three one-time setup paths that write a whole
tree and only need the tree on disk before the first user write:

| Path | Host syncs today | Cost on this Mac (2026-10-05, cold process) |
|---|---|---|
| Fresh store: PGlite initdb through the durable fs | 1613 `fsync` + 746 `fdatasync`, interleaved with the writes | 7.7 s to `waitReady`; 0.63 s with host syncs off; 25-45 s under suite load |
| `extractSnapshot` (one-time conversion) | one `fsync` per file as it is written + one per directory | 5.1 s for a 45 MB, 1009-entry store (extract + verify) |
| `migratePgliteDir` PG16→17 restore | none: stock NodeFS, `relaxedDurability: false` awaits a no-op `syncToFs` | the restored tree is never synced at all |

Why interleaving is the cost, not the count (`scratchpad/bench/fs-bench.mjs`,
1100 files × 27 KB in 40 dirs, APFS):

| Pattern | Time |
|---|---|
| write + `fsync` per file, then dirs | 5278 ms |
| write all, then `fsync` every file and dir | 67 ms + 19 ms |
| write all, `fsync` one file | 8 ms (flushes the whole journal transaction) |
| write all, `fsync` the other 1099 | 16 ms |

Same shape at 1600 × 8 KB (initdb-sized): 7709 ms vs 89 + 25 ms. An
`fsync` after a write forces a journal commit; back-to-back `fsync`s of
already-flushed files are ~15 µs each. So one walk over a finished tree
costs tens of milliseconds for the same durability.

## Decisions

1. **A fresh initdb runs with host syncs off, then one tree sync.** The
   durable fs detects "fresh" at `initialSyncFs` (PGlite calls it before
   initdb) by the absence of `PG_VERSION` in the data dir. It then returns 0
   from both sync hooks until PGlite's first `syncToFs` call, walks the tree
   once (`syncTree`), and enables per-commit syncs. Both pinned PGlite builds
   call `await this.syncToFs()` right after `_pgl_backend()` /
   `_pg_initdb()` and before `ready = true`
   (`@electric-sql/pglite@0.3.15/dist/index.js`,
   `@electric-sql/pglite@0.2.17/dist/index.js`), so no user query can be
   acknowledged before the walk. This is Postgres's own `initdb -N` followed
   by `initdb --sync-only`. A `loadDataDir` restore takes the same path:
   `PG_VERSION` is absent at `initialSyncFs` and the walk covers the tar's
   contents. A failing file `fsync` in the walk propagates and rejects
   `waitReady`; directory `fsync` failures are tolerated as today (Windows
   cannot open a directory).
2. **No completion marker and no wipe.** Probed on 0.3.15: a non-empty data
   dir without `PG_VERSION` makes `pgl_initdb` exit(1); `PG_VERSION` with
   nothing else traps (`RuntimeError: unreachable`). Neither re-runs initdb,
   today or after this change. Today's initdb writes `PG_VERSION` early and
   relies on its final pass for the rest, so a power loss during the first
   boot of a brand-new store already leaves a torn, unopenable dir; the
   window shrinks from ~8 s to under 1 s and holds no user data in either
   case. A preflight that wiped "non-empty, no `PG_VERSION`" would destroy a
   misconfigured storage path that today fails safely with exit(1). A
   marker inside PGDATA would have to be removed durably before the first
   acknowledged write or a stale marker would wipe real data. Equivalent to
   today is the bar; this meets it with no new failure mode.
3. **Conversion syncs the converted tree once, after verification.**
   `extractSnapshot` writes without syncing; `convertSnapshotDir` runs
   `syncTree(.converting)` after the verify handle is closed and
   `postmaster.pid` removed, so the verify open's own writes (`pg_control`
   state, shutdown record) are covered too. The parent directory is fsynced
   after each rename so the on-disk state after a power loss is always one
   row of the recovery table. Sync count: one `fsync` per file and directory
   in the tree (the portable minimum: there is no "sync this subtree" call
   in Node) plus two parent syncs. The saving is ordering, not count.
   `extractSnapshot` keeps its contract through an additive `sync` option
   (default true, batched at the end); the converter passes `false`.
4. **The PG16→17 restore gets one `syncTree` after its close.** Stock
   NodeFS has no host sync, so `relaxedDurability: false` costs nothing
   (`BaseFilesystem.syncToFs` is `async syncToFs(e){}`); it stays. Today the
   migrated tree sits in the page cache until each file is rewritten; the
   walk closes that gap for ~30 ms. The in-memory legacy dump is unchanged.
5. **Budgets are lowered only where measured.** The 90 s / 120 s / 180 s
   budgets exist for the interleaved initdb. After the change the full
   `pnpm test` of reactor-api is measured and budgets are set to leave 3-5×
   for the Windows runner, where `FlushFileBuffers` is still one real call
   per file in the walk.

## Design

```ts
// packages/reactor-api/src/pglite/sync-tree.ts
export interface SyncTreeHostFs { fsyncSync(fd: number): void }
export interface SyncTreeResult { files: number; dirs: number }
/** fsyncs every regular file and directory under `root`, root included. */
export function syncTree(root: string, hostFs?: SyncTreeHostFs): SyncTreeResult;
/** fsyncs one directory; false where the platform refuses. */
export function syncDirectory(dir: string, hostFs?: SyncTreeHostFs): boolean;
```

Durable fs (`durable-node-fs.ts`):

```ts
private hostSyncs = fsync;   // false from initialSyncFs until the first syncToFs of a fresh dir
private freshInit = false;

async initialSyncFs() {
  await super.initialSyncFs();
  this.freshInit = fsync && !existsSync(join(resolvedDir, "PG_VERSION"));
  if (this.freshInit) this.hostSyncs = false;
  // maintenance start as before
}
async syncToFs(relaxedDurability) {
  maintenance.noteSync();
  await super.syncToFs(relaxedDurability);
  if (!this.freshInit) return;
  this.freshInit = false;
  this.hostSyncs = true;
  syncTree(resolvedDir, hostFs);
}
// fsyncStream / fdatasync: `if (!this.hostSyncs) return 0;` first.
```

Conversion (`snapshot-reader.ts`, `convert-snapshot-dir.ts`):

- `ExtractSnapshotOptions.sync?: boolean` (default true) and
  `hostFs?: SyncTreeHostFs`; the per-file `writeFileSynced` becomes
  `fs.writeFile`; the final loop over `dirsWritten` becomes
  `if (sync) syncTree(root, hostFs)`.
- `ConversionDeps.hostFs?: SyncTreeHostFs` (tests count). Sequence:
  extract(`sync: false`) → verify → close → rm `postmaster.pid` →
  `syncTree(converting)` → rename old → `syncDirectory(parent)` → rename new
  → `syncDirectory(parent)` → rm `.old`.

Migration (`apps/switchboard/src/pglite-migration.ts`): `syncTree(dataDir)`
after the restore's `pg.close()`, inside the try that rolls back.

## Tests

`packages/reactor-api/test/pglite/durable-node-fs.test.ts`:

- "fresh initdb issues no host syncs until init completes, then one tree
  sync": injected `hostFs`; at `waitReady`, `fdatasync === 0` (746 today)
  and `fsync` equals the file + directory count of the data dir; then
  `COMMITS` inserts → `fdatasync` delta `=== COMMITS`.
- "reopening an existing store does not walk the tree": second open of the
  same dir; `fsync` at `waitReady` well under the tree size; still one
  `fdatasync` per commit.

`packages/reactor-api/test/pglite/convert-snapshot-dir.test.ts`:

- "syncs the converted tree once, after the last file is written": injected
  `deps.hostFs`; the first `fsync` call sees every entry already on disk
  under `.converting`; total `=== files + dirs + 2`.

`packages/reactor-api/test/pglite/sync-tree.test.ts`: counts, root included,
symlinks skipped, a failing file fsync propagates, a directory refusal is
tolerated.

Everything else stays green; `durable-node-fs-pg16.test.ts` keeps its
assertions (its logged `fsyncBefore` drops).

## Results

Filled in after implementation; same machine, cold process per run.

| Measurement | Before | After |
|---|---|---|
| Fresh initdb to `waitReady`, fsync on | 7.7 s (1613 fsync + 746 fdatasync) | 0.71-0.76 s (999 fsync, 0 fdatasync); stock NodeFS 0.65 s |
| Fresh initdb, host syncs at `waitReady` | 2359 | 999 = 973 files + 26 dirs, back to back |
| Convert a 45 MB / 1009-entry snapshot store | 5.1 s | 0.32 s; 1014 fsync = 985 files + 27 dirs + 2 parent |
| `durable-node-fs-pg16.test.ts` (fresh PG16 initdb over 0.2.17) | 18 s on this Mac per its comment | in a 16.9 s run of three switchboard files |
| `pnpm vitest run test/pglite` (reactor-api) | 90 s to 180 s budgets, hit at 25-45 s per initdb under load | 7 files, 57 tests, 58.6 s wall |
| Switchboard `pglite-preflight` + `durable-node-fs-pg16` + `boot-unsupported-stored-documents` | | 3 files, 11 tests, 16.9 s wall |
| Full `pnpm test` (reactor-api) | | 104 files, 1583 tests, 55.6 s wall; slowest pglite case 14.9 s (conversion), fresh-initdb cases 8-9 s |

Budgets stay. Under full-suite load the slowest pglite case still takes
14.9 s and a fresh initdb 8-9 s (CPU-bound wasm across parallel workers,
not syncs), so 90 s leaves ~6× for the Windows runner, where every file
`fsync` in the walk is one `FlushFileBuffers`; 30 s would not. The comments
that justified the budgets by initdb's sync count were rewritten.

## Deviations

- `syncTree` is synchronous (`fs.*Sync`), not the `fs.promises` style of
  the reader it replaced: it runs inside `syncToFs` during init and over a
  finished tree, where 1000 fsyncs take ~30 ms.
- `extractSnapshot`'s doc comment no longer says "fsyncing what it writes";
  the `sync` option (default true) documents the behaviour.
- `convertSnapshotDir` passes `deps.hostFs` to the parent-directory syncs
  too, so the test's count covers all three sync sites.
- The reopen test asserts `fsync` at `waitReady` is under half the tree
  size rather than a fixed number; Postgres startup fsyncs a few files of
  its own.
- `durable-node-fs-pg16.test.ts` changes only its budget comment; the fresh
  PG16 initdb on 0.2.17 takes the same first-`syncToFs` path and passes.
