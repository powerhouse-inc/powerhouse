import type { MessageRouter } from "./message-router.js";
import { opChannel } from "./op-channel.js";

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

export function createInspectorProxy(router: MessageRouter): IInspectorProxy {
  const ops = opChannel(router, "inspector-op");

  return {
    getQueueState: () => ops.call("queue.getState"),
    pauseQueue: () => ops.callVoid("queue.pause"),
    resumeQueue: () => ops.callVoid("queue.resume"),
    getProcessors: () => ops.call("processors.getAll"),
    retryProcessor: (processorId) =>
      ops.callVoid("processors.retry", [processorId]),
    validateDocument: (documentId, branch) =>
      ops.call("integrity.validate", [documentId, branch]),
    rebuildKeyframes: (documentId, branch) =>
      ops.call("integrity.rebuildKeyframes", [documentId, branch]),
    rebuildSnapshots: (documentId, branch) =>
      ops.call("integrity.rebuildSnapshots", [documentId, branch]),
    queryReactorDb: (sql, params) => ops.call("db.query", [sql, params ?? []]),
  };
}
