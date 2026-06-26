import type { PGliteWithLive } from "@electric-sql/pglite/live";
import { createLiveQueryProxy } from "./live-query-proxy.js";
import type { MessageRouter } from "./message-router.js";
import { opChannel } from "./op-channel.js";

export function createRelationalPgliteProxy(
  router: MessageRouter,
): PGliteWithLive {
  const ops = opChannel(router, "db-op");
  const liveProxy = createLiveQueryProxy(router);

  const proxy = {
    query: async (sql: string, params?: unknown[]) => {
      const rows = await ops.call("query", [sql, params ?? []]);
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
