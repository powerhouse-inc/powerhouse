import { fromErrorInfo } from "./error-info.js";
import type { CorrelationId, OwnerMessage } from "./protocol.js";
import type { IRpcTransport } from "./transport.js";

export interface IInspectorProxy {
  getQueueState(): Promise<unknown>;
  pauseQueue(): Promise<void>;
  resumeQueue(): Promise<void>;
  getProcessors(): Promise<unknown>;
  retryProcessor(processorId: string): Promise<void>;
  validateDocument(documentId: string, branch?: string): Promise<unknown>;
  rebuildKeyframes(documentId: string, branch?: string): Promise<unknown>;
  rebuildSnapshots(documentId: string, branch?: string): Promise<unknown>;
  queryReactorDb(sql: string, params?: unknown[]): Promise<unknown>;
}

type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
  timer?: ReturnType<typeof setTimeout>;
};

const INSPECTOR_OP_TIMEOUT_MS = 30000;

export function createInspectorProxy(
  transport: IRpcTransport,
): IInspectorProxy {
  let counter = 0;
  const pending = new Map<CorrelationId, Pending>();

  transport.onMessage((message) => {
    const msg = message as OwnerMessage;
    if (msg.k === "res") {
      const entry = pending.get(msg.id);
      if (entry) {
        pending.delete(msg.id);
        if (entry.timer) clearTimeout(entry.timer);
        entry.resolve(msg.value);
      }
    } else if (msg.k === "err") {
      const entry = pending.get(msg.id);
      if (entry) {
        pending.delete(msg.id);
        if (entry.timer) clearTimeout(entry.timer);
        entry.reject(fromErrorInfo(msg.error));
      }
    }
  });

  const send = (method: string, args: unknown[]): Promise<unknown> => {
    const id: CorrelationId = `insp${++counter}`;
    const promise = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (pending.delete(id)) {
          reject(
            new Error(
              `Reactor worker did not respond to inspector-op "${method}" within ${INSPECTOR_OP_TIMEOUT_MS}ms; the worker may have failed to load`,
            ),
          );
        }
      }, INSPECTOR_OP_TIMEOUT_MS);
      pending.set(id, { resolve, reject, timer });
    });
    transport.post({ k: "inspector-op", id, method, args });
    return promise;
  };

  return {
    getQueueState: () => send("queue.getState", []),
    pauseQueue: () => send("queue.pause", []).then(() => undefined),
    resumeQueue: () => send("queue.resume", []).then(() => undefined),
    getProcessors: () => send("processors.getAll", []),
    retryProcessor: (processorId) =>
      send("processors.retry", [processorId]).then(() => undefined),
    validateDocument: (documentId, branch) =>
      send("integrity.validate", [documentId, branch]),
    rebuildKeyframes: (documentId, branch) =>
      send("integrity.rebuildKeyframes", [documentId, branch]),
    rebuildSnapshots: (documentId, branch) =>
      send("integrity.rebuildSnapshots", [documentId, branch]),
    queryReactorDb: (sql, params) => send("db.query", [sql, params ?? []]),
  };
}
