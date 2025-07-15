import { type LiveQueryResults } from "@electric-sql/pglite/live";
import {
  createNamespacedQueryBuilder,
  type IOperationalQueryBuilder,
  type RelationalDbProcessorClass,
} from "document-drive/processors/relational-db-processor";
import { useEffect, useState } from "react";
import { useRelationalDb } from "./useRelationalDb.js";

export type QueryCallbackReturnType = {
  sql: string;
  parameters?: readonly unknown[];
};

export type useRelationalQueryOptions = {
  // Whether to hash the namespace to avoid namespace size limit. True by default
  hashNamespace?: boolean;
};

export function useRelationalQuery<Schema, T = unknown, TParams = undefined>(
  ProcessorClass: RelationalDbProcessorClass<Schema>,
  driveId: string,
  queryCallback: (
    db: IOperationalQueryBuilder<Schema>,
    parameters?: TParams,
  ) => QueryCallbackReturnType,
  parameters?: TParams,
  options?: useRelationalQueryOptions,
) {
  const [result, setResult] = useState<LiveQueryResults<T> | null>(null);
  const [queryLoading, setQueryLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>(undefined);

  const relationalDb = useRelationalDb<any>();

  useEffect(() => {
    setError(undefined);
    setQueryLoading(true);

    if (!relationalDb.db || !relationalDb.dbReady) {
      return;
    }

    // Use processor's query method to get namespaced database
    const db = createNamespacedQueryBuilder(
      ProcessorClass,
      driveId,
      relationalDb.db,
      options,
    );

    const compiledQuery = queryCallback(db, parameters);
    const { sql, parameters: queryParameters } = compiledQuery;

    const live = relationalDb.db.live
      .query<T>(sql, queryParameters ? [...queryParameters] : [], (result) => {
        setResult(result);
        setQueryLoading(false);
      })
      .catch((error: unknown) => {
        setQueryLoading(false);
        setError(error instanceof Error ? error : new Error(error as string));
      });

    return () => {
      void live.then((l) => l?.unsubscribe());
    };
  }, [relationalDb.db, ProcessorClass, driveId, queryCallback, parameters]);

  return {
    isLoading: relationalDb.isLoading || queryLoading || !relationalDb.dbReady,
    error: error || relationalDb.error,
    result,
  } as const;
}
