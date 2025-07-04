import {
  type LiveQuery,
  type LiveQueryResults,
} from "@electric-sql/pglite/live";
import { type CompiledQuery, type Kysely } from "kysely";
import { useEffect, useState } from "react";
import { useOperationalDB } from "./useOperationalDB.js";
import { usePGliteDB } from "./usePGlite.js";

export function useLiveQuery<Schema, T = unknown>(
  queryCallback: (db: Kysely<Schema>) => CompiledQuery<T>,
) {
  const [result, setResult] = useState<LiveQueryResults<T> | null>(null);

  const pglite = usePGliteDB();
  const operationalDB = useOperationalDB<Schema>();

  useEffect(() => {
    let live: Promise<LiveQuery<T> | null> = Promise.resolve(null);

    if (operationalDB.db && pglite.db) {
      const compiledQuery = queryCallback(operationalDB.db);
      const { sql } = compiledQuery;

      console.log(">>> pglite:hook", pglite);

      live = pglite.db.live.query(sql, [], (result) => {
        setResult(result);
      });
    }

    return () => {
      void live.then((l) => l?.unsubscribe());
    };
  }, [operationalDB.db, pglite.db, queryCallback]);

  return {
    isLoading: pglite.isLoading || operationalDB.isLoading,
    error: pglite.error || operationalDB.error,
    result,
  } as const;
}
