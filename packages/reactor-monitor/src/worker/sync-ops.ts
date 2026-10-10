/**
 * The worker side of `SyncManagerProxy`'s op channel.
 *
 * Re-exported from `@powerhousedao/reactor-browser/rpc` so the monitor's worker
 * and Connect's worker resolve the identical `sync-op` contract from one
 * definition — including the W0.5 sync-inspection and repair ops. Kept here as a
 * named module so existing imports (and the package's own barrel) stay stable.
 */
export {
  dispatchSyncOp,
  toWireRemote,
  type InspectableSyncManager,
  type WireRemote,
} from "@powerhousedao/reactor-browser/rpc";
