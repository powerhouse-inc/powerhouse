// Dependency-free, so the root entry can listen without the RPC graph.

// Synthetic bus channel id for sync-status deltas (not a reactor IEventBus type).
export const SYNC_STATUS_CHANGED_EVENT = 90001;
// Carries the worker's remotes after a local peer is adopted or removed.
export const SYNC_REMOTES_CHANGED_EVENT = 90002;
// The worker is about to sign with nobody signed in: a tab may sign someone in
// (hosted Connect's browser pseudonym) and posts its identity in answer.
export const SIGNING_IDENTITY_NEEDED_EVENT = 90003;
// A remote refused one of the worker's sync channels: `{ url, status, reason? }`,
// for the tab's refusal handler.
export const SYNC_REFUSED_EVENT = 90004;
