export type WorkerConnectionStatus =
  | "connected"
  | "lost"
  | "failed"
  | "storage-unusable";

let status: WorkerConnectionStatus = "connected";
const listeners = new Set<() => void>();

export function getWorkerConnectionStatus(): WorkerConnectionStatus {
  return status;
}

/** "storage-unusable" holds until the page reloads; a live worker's pong does not clear it. */
export function setWorkerConnectionStatus(next: WorkerConnectionStatus): void {
  if (status === next || status === "storage-unusable") {
    return;
  }
  status = next;
  for (const listener of [...listeners]) {
    listener();
  }
}

export function subscribeWorkerConnection(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
