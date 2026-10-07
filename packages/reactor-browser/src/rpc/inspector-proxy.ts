import {
  INSPECTOR_OPS,
  type IInspector,
  type IInspectorAdmin,
  type InspectorOpKey,
  type IReactorDbQuery,
} from "@powerhousedao/reactor";
import type { MessageRouter } from "@powerhousedao/reactor/rpc";
import { opChannel } from "./op-channel.js";

// The rows Connect's worker serves today. The rest of INSPECTOR_OPS join once
// a worker host dispatches through dispatchInspectorOp.
const WORKER_SERVED_OPS = [
  "getQueueState",
  "getProcessors",
  "getCatchUpStatus",
  "validateDocument",
  "pauseQueue",
  "resumeQueue",
  "retryProcessor",
  "sweepCatchUp",
  "rebuildKeyframes",
  "rebuildSnapshots",
  "queryDb",
] as const satisfies readonly InspectorOpKey[];

type WorkerServedOp = (typeof WORKER_SERVED_OPS)[number];

/** `queryReactorDb` is the published name of `queryDb`. */
export interface IInspectorProxy extends Pick<
  IInspector & IInspectorAdmin & IReactorDbQuery,
  WorkerServedOp
> {
  queryReactorDb(sql: string, params?: unknown[]): Promise<unknown[]>;
}

export function createInspectorProxy(router: MessageRouter): IInspectorProxy {
  const ops = opChannel(router, "inspector-op");
  const proxy: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
  for (const key of WORKER_SERVED_OPS) {
    proxy[key] = (...args) => ops.call(INSPECTOR_OPS[key].rpc, args);
  }
  const queryDb = (sql: unknown, params?: unknown) =>
    ops.call(INSPECTOR_OPS.queryDb.rpc, [sql, params ?? []]);
  proxy.queryDb = queryDb;
  proxy.queryReactorDb = queryDb;
  return proxy as unknown as IInspectorProxy;
}
