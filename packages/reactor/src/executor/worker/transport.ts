/**
 * Transport-agnostic surface that {@link WorkerHandle} consumes.
 *
 * The handle is written against this interface — not a `worker_threads.Worker`
 * directly — so unit tests can swap in a fake transport and future cards can
 * add a `child_process` adapter without touching the handle.
 */

import { Worker, type WorkerOptions } from "node:worker_threads";
import type { ParentMessage, WorkerMessage } from "./protocol.js";

export type WorkerTransportEventMap = {
  message: WorkerMessage;
  error: Error;
  exit: number;
};

export type WorkerTransportEvent = keyof WorkerTransportEventMap;

export type WorkerTransportListener<E extends WorkerTransportEvent> = (
  payload: WorkerTransportEventMap[E],
) => void;

/**
 * Minimal subset of `worker_threads.Worker` that {@link WorkerHandle} relies
 * on. Implementations must guarantee that `postMessage` payloads are
 * structured-cloned across the boundary.
 */
export interface IWorkerTransport {
  postMessage(message: ParentMessage): void;
  on<E extends WorkerTransportEvent>(
    event: E,
    listener: WorkerTransportListener<E>,
  ): void;
  off<E extends WorkerTransportEvent>(
    event: E,
    listener: WorkerTransportListener<E>,
  ): void;
  terminate(): Promise<number>;
}

/**
 * Wraps a `node:worker_threads` Worker so it satisfies {@link IWorkerTransport}.
 */
export function createThreadTransport(
  scriptPath: string | URL,
  options?: WorkerOptions,
): IWorkerTransport {
  const worker = new Worker(scriptPath, options);
  return {
    postMessage(message) {
      worker.postMessage(message);
    },
    on(event, listener) {
      worker.on(event, listener as (...args: unknown[]) => void);
    },
    off(event, listener) {
      worker.off(event, listener as (...args: unknown[]) => void);
    },
    async terminate() {
      return await worker.terminate();
    },
  };
}
