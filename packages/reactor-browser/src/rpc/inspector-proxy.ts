import type {
  CatchUpStatus,
  IInspector,
  InspectorAttachmentInfo,
  InspectorDocumentModelInfo,
  InspectorDriveIntegrity,
  InspectorDrivePage,
  InspectorProcessorInfo,
  QueueStateSnapshot,
  RebuildResult,
  StorageHealth,
  SweepResult,
  ValidationResult,
} from "@powerhousedao/reactor";
import { INSPECTOR_OPS } from "./inspector-ops.js";
import type { MessageRouter } from "./message-router.js";
import { opChannel } from "./op-channel.js";

/**
 * The reactor's inspection surface over RPC. `IInspector` plus the raw-SQL
 * capability, which keeps its historical `queryReactorDb` name here because
 * the method is part of the proxy's published API.
 */
export interface IInspectorProxy extends IInspector {
  queryReactorDb(sql: string, params?: unknown[]): Promise<unknown[]>;
}

export function createInspectorProxy(router: MessageRouter): IInspectorProxy {
  const ops = opChannel(router, "inspector-op");

  return {
    listDocumentModels: () =>
      ops.call(INSPECTOR_OPS.listDocumentModels) as Promise<
        InspectorDocumentModelInfo[]
      >,
    listDrives: (cursor, limit) =>
      ops.call(INSPECTOR_OPS.listDrives, [
        cursor,
        limit,
      ]) as Promise<InspectorDrivePage>,
    checkDriveIntegrity: (driveId, cursor, limit) =>
      ops.call(INSPECTOR_OPS.checkDriveIntegrity, [
        driveId,
        cursor,
        limit,
      ]) as Promise<InspectorDriveIntegrity>,
    getAttachmentInfo: () =>
      ops.call(
        INSPECTOR_OPS.getAttachmentInfo,
      ) as Promise<InspectorAttachmentInfo>,
    getQueueState: () =>
      ops.call(INSPECTOR_OPS.getQueueState) as Promise<QueueStateSnapshot>,
    pauseQueue: () => ops.callVoid(INSPECTOR_OPS.pauseQueue),
    resumeQueue: () => ops.callVoid(INSPECTOR_OPS.resumeQueue),
    getProcessors: () =>
      ops.call(INSPECTOR_OPS.getProcessors) as Promise<
        InspectorProcessorInfo[]
      >,
    retryProcessor: (processorId) =>
      ops.callVoid(INSPECTOR_OPS.retryProcessor, [processorId]),
    getCatchUpStatus: () =>
      ops.call(INSPECTOR_OPS.getCatchUpStatus) as Promise<CatchUpStatus>,
    sweepCatchUp: () =>
      ops.call(INSPECTOR_OPS.sweepCatchUp) as Promise<SweepResult[]>,
    validateDocument: (documentId, branch) =>
      ops.call(INSPECTOR_OPS.validateDocument, [
        documentId,
        branch,
      ]) as Promise<ValidationResult>,
    rebuildKeyframes: (documentId, branch) =>
      ops.call(INSPECTOR_OPS.rebuildKeyframes, [
        documentId,
        branch,
      ]) as Promise<RebuildResult>,
    rebuildSnapshots: (documentId, branch) =>
      ops.call(INSPECTOR_OPS.rebuildSnapshots, [
        documentId,
        branch,
      ]) as Promise<RebuildResult>,
    getStorageHealth: () =>
      ops.call(INSPECTOR_OPS.getStorageHealth) as Promise<StorageHealth>,
    queryReactorDb: (sql, params) =>
      ops.call(INSPECTOR_OPS.queryReactorDb, [sql, params ?? []]) as Promise<
        unknown[]
      >,
  };
}
