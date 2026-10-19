import {
  clearStorageHeld,
  getWorkerConnectionStatus,
  setWorkerConnectionStatus,
} from "../connection-state.js";
import { watchStoreLockWait } from "./store-lock.js";

type Startup = (options: { isWaiting: () => boolean }) => Promise<void>;

/** Runs the worker's startup seed, showing storage-held while its stores are locked elsewhere. */
export async function startupOwningStores(
  startup: Startup,
  namespaces: string[],
  watchOptions?: Parameters<typeof watchStoreLockWait>[2],
): Promise<void> {
  const stopWatching = watchStoreLockWait(
    namespaces,
    (waiting) =>
      waiting ? setWorkerConnectionStatus("storage-held") : clearStorageHeld(),
    watchOptions,
  );
  try {
    await startup({
      isWaiting: () => getWorkerConnectionStatus() === "storage-held",
    });
    clearStorageHeld();
  } finally {
    stopWatching();
  }
}
