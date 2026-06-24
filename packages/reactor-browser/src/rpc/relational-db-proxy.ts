import type { PGliteWithLive } from "@electric-sql/pglite/live";
import { fromErrorInfo } from "./error-info.js";
import { createLiveQueryProxy } from "./live-query-proxy.js";
import type { CorrelationId, OwnerMessage } from "./protocol.js";
import type { IRpcTransport } from "./transport.js";

type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
};

export function createRelationalPgliteProxy(
  transport: IRpcTransport,
): PGliteWithLive {
  let counter = 0;
  const pending = new Map<CorrelationId, Pending>();

  transport.onMessage((message) => {
    const msg = message as OwnerMessage;
    if (msg.k === "res") {
      const entry = pending.get(msg.id);
      if (entry) {
        pending.delete(msg.id);
        entry.resolve(msg.value);
      }
    } else if (msg.k === "err") {
      const entry = pending.get(msg.id);
      if (entry) {
        pending.delete(msg.id);
        entry.reject(fromErrorInfo(msg.error));
      }
    }
  });

  const runQuery = (sql: string, params: unknown[]): Promise<unknown> => {
    const id: CorrelationId = `db${++counter}`;
    const promise = new Promise<unknown>((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });
    transport.post({ k: "db-op", id, method: "query", args: [sql, params] });
    return promise;
  };

  const liveProxy = createLiveQueryProxy(transport);

  const proxy = {
    query: async (sql: string, params?: unknown[]) => {
      const rows = await runQuery(sql, params ?? []);
      return { rows };
    },
    live: {
      query: (
        sql: string,
        params: unknown[] | null | undefined,
        callback?: (results: unknown) => void,
      ) =>
        new Promise((resolve, reject) => {
          // Settle on the first result/error so a subscribe failure reaches the caller's retry path.
          let settled = false;
          const unsubscribe = liveProxy.query(
            sql,
            params ?? [],
            (results) => {
              if (!settled) {
                settled = true;
                resolve({ unsubscribe });
              }
              callback?.(results);
            },
            (error) => {
              if (!settled) {
                settled = true;
                reject(
                  error instanceof Error ? error : new Error(String(error)),
                );
              }
            },
          );
        }),
    },
  };

  return proxy as unknown as PGliteWithLive;
}
