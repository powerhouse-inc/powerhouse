import { Worker, type WorkerOptions } from "node:worker_threads";
import type {
  ProjectionParentMessage,
  ProjectionWorkerMessage,
} from "./protocol.js";

export type ProjectionTransportEventMap = {
  message: ProjectionWorkerMessage;
  error: Error;
  exit: number;
};

export type ProjectionTransportEvent = keyof ProjectionTransportEventMap;

export type ProjectionTransportListener<E extends ProjectionTransportEvent> = (
  payload: ProjectionTransportEventMap[E],
) => void;

/**
 * Minimal subset of `worker_threads.Worker` the {@link ProjectionShardManager}
 * relies on. The host writes against this interface so tests can swap in
 * a fake transport without spawning real worker threads.
 */
export interface IProjectionTransport {
  postMessage(message: ProjectionParentMessage): void;
  on<E extends ProjectionTransportEvent>(
    event: E,
    listener: ProjectionTransportListener<E>,
  ): void;
  off<E extends ProjectionTransportEvent>(
    event: E,
    listener: ProjectionTransportListener<E>,
  ): void;
  terminate(): Promise<number>;
}

export function createProjectionThreadTransport(
  scriptPath: string | URL,
  options?: WorkerOptions,
): IProjectionTransport {
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
