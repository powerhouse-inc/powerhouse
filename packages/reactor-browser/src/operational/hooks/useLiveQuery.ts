import {
  type LiveQuery,
  type LiveQueryResults,
} from "@electric-sql/pglite/live";
import { type Kysely } from "kysely";
import { useEffect, useState } from "react";
import { usePGliteDB } from "../../pglite/hooks/usePGlite.js";
import { useOperationalStore } from "./useOperationalStore.js";

export type QueryCallbackReturnType = {
  sql: string;
  parameters?: readonly unknown[];
};

export function useLiveQuery<Schema, T = unknown, TParams = undefined>(
  queryCallback: (
    db: Kysely<Schema>,
    parameters?: TParams,
  ) => QueryCallbackReturnType,
  parameters?: TParams,
) {
  const [result, setResult] = useState<LiveQueryResults<T> | null>(null);
  const [queryLoading, setQueryLoading] = useState(true);

  const pglite = usePGliteDB();
  const operationalDB = useOperationalStore<Schema>();

  useEffect(() => {
    let live: Promise<LiveQuery<T> | null> = Promise.resolve(null);

    if (operationalDB.db && pglite.db) {
      const compiledQuery = queryCallback(operationalDB.db, parameters);
      const { sql, parameters: queryParameters } = compiledQuery;

      live = pglite.db.live.query(
        sql,
        queryParameters ? [...queryParameters] : [],
        (result) => {
          setResult(result);
          setQueryLoading(false);
        },
      );
    }

    return () => {
      void live.then((l) => l?.unsubscribe());
    };
  }, [operationalDB.db, pglite.db, queryCallback, parameters]);

  return {
    isLoading: pglite.isLoading || operationalDB.isLoading || queryLoading,
    error: pglite.error || operationalDB.error,
    result,
  } as const;
}
