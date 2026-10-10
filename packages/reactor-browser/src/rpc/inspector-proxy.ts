import {
  INSPECTOR_OPS,
  type IInspector,
  type IInspectorAdmin,
  type IReactorDbQuery,
} from "@powerhousedao/reactor";
import type { MessageRouter } from "@powerhousedao/reactor/rpc";
import { opChannel } from "./op-channel.js";

/** `queryReactorDb` is the published name of `queryDb`. */
export interface IInspectorProxy
  extends IInspector, IInspectorAdmin, IReactorDbQuery {
  queryReactorDb(sql: string, params?: unknown[]): Promise<unknown[]>;
}

/** Every row of `INSPECTOR_OPS`; the host decides which tiers it serves. */
export function createInspectorProxy(router: MessageRouter): IInspectorProxy {
  const ops = opChannel(router, "inspector-op");
  const proxy: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
  for (const [key, spec] of Object.entries(INSPECTOR_OPS)) {
    proxy[key] = (...args) => ops.call(spec.rpc, args);
  }
  const queryDb = (sql: unknown, params?: unknown) =>
    ops.call(INSPECTOR_OPS.queryDb.rpc, [sql, params ?? []]);
  proxy.queryDb = queryDb;
  proxy.queryReactorDb = queryDb;
  return proxy as unknown as IInspectorProxy;
}
