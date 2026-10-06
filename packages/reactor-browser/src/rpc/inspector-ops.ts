import {
  dispatchTableOp,
  INSPECTOR_OPS,
  methodOf,
  opKeyOf,
  SYNC_INSPECTION_OPS,
  type IInspector,
  type IInspectorAdmin,
  type InspectorAccess,
  type IReactorDbQuery,
  type ISyncAdmin,
  type ISyncInspector,
} from "@powerhousedao/reactor";

export type InspectorOpTargets = {
  inspector: IInspector & Partial<IInspectorAdmin>;
  dbQuery?: IReactorDbQuery;
};

/** Host side of `inspector-op`; refuses tiers `access` does not grant. */
export function dispatchInspectorOp(
  targets: InspectorOpTargets,
  access: InspectorAccess,
  method: string,
  args: unknown[],
): Promise<unknown> {
  return dispatchTableOp(
    INSPECTOR_OPS,
    (key) =>
      key === "queryDb"
        ? methodOf(targets.dbQuery, key)
        : methodOf(targets.inspector, key),
    access,
    method,
    args,
  );
}

export type SyncInspectionOpTargets = {
  inspector?: ISyncInspector;
  admin?: ISyncAdmin;
};

/** Whether `method` is one of the `sync-op` rows `dispatchSyncInspectionOp` serves. */
export function isSyncInspectionOp(method: string): boolean {
  return opKeyOf(SYNC_INSPECTION_OPS, method) !== undefined;
}

/** Host side of the inspection and repair rows of `sync-op`. */
export function dispatchSyncInspectionOp(
  targets: SyncInspectionOpTargets,
  access: InspectorAccess,
  method: string,
  args: unknown[],
): Promise<unknown> {
  return dispatchTableOp(
    SYNC_INSPECTION_OPS,
    (key) =>
      SYNC_INSPECTION_OPS[key].tier === "read"
        ? methodOf(targets.inspector, key)
        : methodOf(targets.admin, key),
    access,
    method,
    args,
  );
}
