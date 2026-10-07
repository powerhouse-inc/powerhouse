export type WorkerConnectionStatus =
  | "connected"
  | "lost"
  | "failed"
  | "storage-unusable"
  | "storage-held";

let status: WorkerConnectionStatus = "connected";
const listeners = new Set<() => void>();

export function getWorkerConnectionStatus(): WorkerConnectionStatus {
  return status;
}

function publish(next: WorkerConnectionStatus): void {
  status = next;
  for (const listener of [...listeners]) {
    listener();
  }
}

/**
 * "storage-unusable" holds until the page reloads, and "storage-held" until
 * {@link clearStorageHeld}; a live worker's pong clears neither.
 */
export function setWorkerConnectionStatus(next: WorkerConnectionStatus): void {
  if (status === next || status === "storage-unusable") {
    return;
  }
  if (status === "storage-held" && next === "connected") {
    return;
  }
  publish(next);
}

export function clearStorageHeld(): void {
  if (status === "storage-held") {
    publish("connected");
  }
}

export function subscribeWorkerConnection(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
