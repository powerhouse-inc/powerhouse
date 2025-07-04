import {
  type LiveQuery,
  type LiveQueryResults,
} from "@electric-sql/pglite/live";
import { type CompiledQuery, type Kysely } from "kysely";
import { useEffect, useState } from "react";
import { useOperationalDB } from "./useOperationalDB.js";
import { usePGliteDB } from "./usePGlite.js";

type OperationalQueryCallback<Schema> = (db: Kysely<Schema>) => CompiledQuery;

export const useOperationalQuery = <Schema>(
  queryCallback: OperationalQueryCallback<Schema>,
) => {
  const [result, setResult] = useState<LiveQueryResults<unknown> | null>(null);

  const pglite = usePGliteDB();
  const operationalDB = useOperationalDB<Schema>();

  useEffect(() => {
    let live: Promise<LiveQuery<unknown> | null> = Promise.resolve(null);

    if (operationalDB.db && pglite.db) {
      const { sql } = queryCallback(operationalDB.db);

      live = pglite.db.live.query(sql, [], (result) => {
        setResult(result);
      });
    }

    return () => {
      void live.then((l) => l?.unsubscribe());
    };
  }, [operationalDB.db, pglite.db]);

  return {
    isLoading: pglite.isLoading || operationalDB.isLoading,
    error: pglite.error || operationalDB.error,
    result,
  };
};
