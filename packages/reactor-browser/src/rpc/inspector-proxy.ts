import { RpcCorrelator } from "./rpc-correlator.js";
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

export function createInspectorProxy(
  transport: IRpcTransport,
): IInspectorProxy {
  const correlator = new RpcCorrelator(transport, {
    prefix: "insp",
    timeoutMs: 30000,
    label: "inspector-op",
  });
  correlator.attach();

  const send = (method: string, args: unknown[]): Promise<unknown> =>
    correlator.request((id) => ({ k: "inspector-op", id, method, args }));

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
