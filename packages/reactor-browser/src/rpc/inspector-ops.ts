import type { IInspector, IReactorDbQuery } from "@powerhousedao/reactor";

/**
 * Wire method strings of the `inspector-op` channel, in the order
 * `IInspectorProxy` declares them. The proxy sends these and
 * `dispatchInspectorOp` resolves them, so the two stay in step from one
 * definition.
 */
export const INSPECTOR_OPS = {
  listDocumentModels: "registry.listDocumentModels",
  listDrives: "drives.list",
  checkDriveIntegrity: "drives.checkIntegrity",
  getQueueState: "queue.getState",
  pauseQueue: "queue.pause",
  resumeQueue: "queue.resume",
  getProcessors: "processors.getAll",
  retryProcessor: "processors.retry",
  getCatchUpStatus: "catchUp.status",
  sweepCatchUp: "catchUp.sweepNow",
  validateDocument: "integrity.validate",
  rebuildKeyframes: "integrity.rebuildKeyframes",
  rebuildSnapshots: "integrity.rebuildSnapshots",
  getStorageHealth: "storage.health",
  queryReactorDb: "db.query",
} as const;

export type InspectorOp = (typeof INSPECTOR_OPS)[keyof typeof INSPECTOR_OPS];

/**
 * Host-side counterpart of `createInspectorProxy`: resolves one
 * `inspector-op` method against an `IInspector` and, for `db.query`, a
 * separate raw-SQL capability. Pass `dbQuery` as undefined to host the
 * inspection surface without raw store access; `db.query` then refuses.
 */
export async function dispatchInspectorOp(
  inspector: IInspector,
  dbQuery: IReactorDbQuery | undefined,
  method: string,
  args: unknown[],
): Promise<unknown> {
  switch (method) {
    case INSPECTOR_OPS.listDocumentModels:
      return inspector.listDocumentModels();
    case INSPECTOR_OPS.listDrives: {
      const [cursor, limit] = args as [string?, number?];
      return inspector.listDrives(cursor, limit);
    }
    case INSPECTOR_OPS.checkDriveIntegrity: {
      const [driveId, cursor, limit] = args as [string, string?, number?];
      return inspector.checkDriveIntegrity(driveId, cursor, limit);
    }
    case INSPECTOR_OPS.getQueueState:
      return inspector.getQueueState();
    case INSPECTOR_OPS.pauseQueue:
      await inspector.pauseQueue();
      return undefined;
    case INSPECTOR_OPS.resumeQueue:
      await inspector.resumeQueue();
      return undefined;
    case INSPECTOR_OPS.getProcessors:
      return inspector.getProcessors();
    case INSPECTOR_OPS.retryProcessor: {
      const [processorId] = args as [string];
      await inspector.retryProcessor(processorId);
      return undefined;
    }
    case INSPECTOR_OPS.getCatchUpStatus:
      return inspector.getCatchUpStatus();
    case INSPECTOR_OPS.sweepCatchUp:
      return inspector.sweepCatchUp();
    case INSPECTOR_OPS.validateDocument: {
      const [documentId, branch] = args as [string, string?];
      return inspector.validateDocument(documentId, branch);
    }
    case INSPECTOR_OPS.rebuildKeyframes: {
      const [documentId, branch] = args as [string, string?];
      return inspector.rebuildKeyframes(documentId, branch);
    }
    case INSPECTOR_OPS.rebuildSnapshots: {
      const [documentId, branch] = args as [string, string?];
      return inspector.rebuildSnapshots(documentId, branch);
    }
    case INSPECTOR_OPS.getStorageHealth:
      return inspector.getStorageHealth();
    case INSPECTOR_OPS.queryReactorDb: {
      if (!dbQuery) {
        throw new Error("Reactor store not available");
      }
      const [sql, params] = args as [string, unknown[]];
      return dbQuery.queryDb(sql, params);
    }
    default:
      throw new Error(`Unknown inspector op: ${method}`);
  }
}
