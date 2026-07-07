export type WorkerConnectionStatus = "connected" | "lost";

let status: WorkerConnectionStatus = "connected";
const listeners = new Set<() => void>();

export function getWorkerConnectionStatus(): WorkerConnectionStatus {
  return status;
}

export function setWorkerConnectionStatus(next: WorkerConnectionStatus): void {
  if (status === next) {
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
