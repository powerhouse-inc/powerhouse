// Dependency-free, so the root entry can listen without the RPC graph.

// Synthetic bus channel id for sync-status deltas (not a reactor IEventBus type).
export const SYNC_STATUS_CHANGED_EVENT = 90001;
// Carries the worker's remotes after a local peer is adopted or removed.
export const SYNC_REMOTES_CHANGED_EVENT = 90002;
