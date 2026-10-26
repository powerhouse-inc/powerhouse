import {
  toWireDeadLetter,
  toWireQueueState,
  type IInspector,
  type ISyncInspector,
  type ISyncManager,
} from "@powerhousedao/reactor";
import type {
  MonitorInspector,
  MonitorSyncInspector,
  MonitorSyncManager,
} from "./types.js";

/** A local inspector read as wire records, the shape a remote one serves. */
export function toMonitorInspector(inspector: IInspector): MonitorInspector {
  return {
    info: () => inspector.info(),
    listDocumentModels: () => inspector.listDocumentModels(),
    listDrives: (cursor, limit) => inspector.listDrives(cursor, limit),
    checkDriveIntegrity: (driveId, branch) =>
      inspector.checkDriveIntegrity(driveId, branch),
    getAttachmentInfo: () => inspector.getAttachmentInfo(),
    getQueueState: async () =>
      toWireQueueState(await inspector.getQueueState()),
    getProcessors: () => inspector.getProcessors(),
    getCatchUpStatus: () => inspector.getCatchUpStatus(),
    getCatchUpPriority: () => inspector.getCatchUpPriority(),
    getStorageHealth: () => inspector.getStorageHealth(),
    validateDocument: (documentId, branch) =>
      inspector.validateDocument(documentId, branch),
  };
}

export function toMonitorSyncInspector(
  inspector: ISyncInspector,
): MonitorSyncInspector {
  return {
    inspectRemote: (remoteName) => inspector.inspectRemote(remoteName),
    inspectRemotes: () => inspector.inspectRemotes(),
    listDeadLetters: async (remoteName, cursor, limit) => {
      const page = await inspector.listDeadLetters(remoteName, cursor, limit);
      return {
        remoteName: page.remoteName,
        results: page.results.map(toWireDeadLetter),
        nextCursor: page.nextCursor ?? null,
      };
    },
  };
}

/** The manager itself, except that its sync reads come back as wire records. */
export function toMonitorSyncManager(
  syncManager: ISyncManager,
  inspector: ISyncInspector,
): MonitorSyncManager {
  const reads = toMonitorSyncInspector(inspector);
  return new Proxy(syncManager, {
    get(target, property) {
      if (Object.hasOwn(reads, property)) {
        return reads[property as keyof MonitorSyncInspector];
      }
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === "function"
        ? (value as (...args: unknown[]) => unknown).bind(target)
        : value;
    },
  }) as unknown as MonitorSyncManager;
}
