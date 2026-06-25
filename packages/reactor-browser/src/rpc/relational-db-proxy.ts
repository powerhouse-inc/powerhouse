import type { PGliteWithLive } from "@electric-sql/pglite/live";
import { createLiveQueryProxy } from "./live-query-proxy.js";
import { RpcCorrelator } from "./rpc-correlator.js";
import type { IRpcTransport } from "./transport.js";

export function createRelationalPgliteProxy(
  transport: IRpcTransport,
): PGliteWithLive {
  const correlator = new RpcCorrelator(transport, {
    prefix: "db",
    timeoutMs: 30000,
    label: "db-op",
  });
  correlator.attach();

  const runQuery = (sql: string, params: unknown[]): Promise<unknown> =>
    correlator.request((id) => ({
      k: "db-op",
      id,
      method: "query",
      args: [sql, params],
    }));

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
