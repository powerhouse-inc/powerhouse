import type { Remote } from "@powerhousedao/reactor";
import type { PHStore } from "../hooks/ph-store.js";

/** The store's sync remotes; none before the reactor is ready. */
export function listSyncRemotes(store: PHStore | undefined): Remote[] {
  try {
    return (
      store?.reactorClientModule?.reactorModule?.syncModule?.syncManager?.list() ??
      []
    );
  } catch {
    return [];
  }
}

// Only a first pull in flight may still bring drives. A connected remote that
// never polled is paused or answer-only; one failed or failing to reconnect won't soon.
function isFirstPullInFlight(remote: Remote) {
  try {
    const { state, receivingPages, lastSuccessUtcMs, failureCount } =
      remote.channel.getConnectionState();
    if (state === "connected") return receivingPages;
    if (state === "reconnecting") return !lastSuccessUtcMs && !failureCount;
    return state === "connecting" && (receivingPages || !lastSuccessUtcMs);
  } catch {
    return false;
  }
}

/** Whether a remote, or one syncing `driveId` when given, is in its first pull. */
export function isInitialSyncInFlight(
  store: PHStore | undefined,
  driveId?: string,
) {
  return listSyncRemotes(store).some(
    (remote) =>
      (driveId === undefined || remote.meta.collectionId.driveId === driveId) &&
      isFirstPullInFlight(remote),
  );
}
