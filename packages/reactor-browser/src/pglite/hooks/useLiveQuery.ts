import {
  type LiveQuery,
  type LiveQueryResults,
} from "@electric-sql/pglite/live";
import { type Kysely } from "kysely";
import { useEffect, useState } from "react";
import { useOperationalDB } from "./useOperationalDB.js";
import { usePGliteDB } from "./usePGlite.js";

export type QueryCallbackReturnType = { sql: string };

export function useLiveQuery<Schema, T = unknown>(
  queryCallback: (db: Kysely<Schema>) => QueryCallbackReturnType,
) {
  const [result, setResult] = useState<LiveQueryResults<T> | null>(null);
  const [queryLoading, setQueryLoading] = useState(true);

  const pglite = usePGliteDB();
  const operationalDB = useOperationalDB<Schema>();

  useEffect(() => {
    let live: Promise<LiveQuery<T> | null> = Promise.resolve(null);

    if (operationalDB.db && pglite.db) {
      const compiledQuery = queryCallback(operationalDB.db);
      const { sql } = compiledQuery;

      live = pglite.db.live.query(sql, [], (result) => {
        setResult(result);
        setQueryLoading(false);
      });
    }

    return () => {
      void live.then((l) => l?.unsubscribe());
    };
  }, [operationalDB.db, pglite.db, queryCallback]);

  return {
    isLoading: pglite.isLoading || operationalDB.isLoading || queryLoading,
    error: pglite.error || operationalDB.error,
    result,
  } as const;
}
