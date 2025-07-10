import {
  type LiveQuery,
  type LiveQueryResults,
} from "@electric-sql/pglite/live";
import { type Kysely } from "kysely";
import { useEffect, useState } from "react";
import { useOperationalStore } from "./useOperationalStore.js";

export type QueryCallbackReturnType = {
  sql: string;
  parameters?: readonly unknown[];
};

export function useOperationalQuery<Schema, T = unknown, TParams = undefined>(
  queryCallback: (
    db: Kysely<Schema>,
    parameters?: TParams,
  ) => QueryCallbackReturnType,
  parameters?: TParams,
) {
  const [result, setResult] = useState<LiveQueryResults<T> | null>(null);
  const [queryLoading, setQueryLoading] = useState(true);

  const operationalStore = useOperationalStore<Schema>();

  useEffect(() => {
    let live: Promise<LiveQuery<T> | null> = Promise.resolve(null);

    if (operationalStore.db) {
      const compiledQuery = queryCallback(operationalStore.db, parameters);
      const { sql, parameters: queryParameters } = compiledQuery;

      live = operationalStore.db.live.query(
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
  }, [operationalStore.db, queryCallback, parameters]);

  return {
    isLoading: operationalStore.isLoading || queryLoading,
    error: operationalStore.error,
    result,
  } as const;
}
