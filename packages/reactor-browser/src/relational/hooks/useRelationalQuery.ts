import type { LiveQueryResults } from "@electric-sql/pglite/live";
import type { RelationalDbProcessorClass } from "document-drive/processors/relational";
import type { IRelationalQueryBuilder } from "document-drive/processors/types";
import { useEffect, useRef, useState } from "react";
import { useRelationalDb } from "./useRelationalDb.js";

export type QueryCallbackReturnType = {
  sql: string;
  parameters?: readonly unknown[];
};

export type useRelationalQueryOptions = {
  // Whether to hash the namespace to avoid namespace size limit. True by default
  hashNamespace?: boolean;
};

const MAX_RETRIES = 5;
const RETRY_DELAY = 200;

const isRelationNotExistError = (error: unknown): boolean => {
  const errorMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : String(error);

  return (
    errorMessage.toLowerCase().includes("relation") &&
    errorMessage.toLowerCase().includes("does not exist")
  );
};

type LiveQueryType = {
  unsubscribe: () => void;
};

export function useRelationalQuery<Schema, T = unknown, TParams = undefined>(
  ProcessorClass: RelationalDbProcessorClass<Schema>,
  driveId: string,
  queryCallback: (
    db: IRelationalQueryBuilder<Schema>,
    parameters?: TParams,
  ) => QueryCallbackReturnType,
  parameters?: TParams,
  options?: useRelationalQueryOptions,
) {
  const [result, setResult] = useState<LiveQueryResults<T> | null>(null);
  const [queryLoading, setQueryLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>(undefined);
  const retryCount = useRef(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout>();

  const relationalDb = useRelationalDb<any>();

  const executeLiveQuery = async (
    sql: string,
    queryParameters: readonly unknown[] | undefined,
    retryAttempt = 0,
  ): Promise<LiveQueryType | null> => {
    if (!relationalDb.db) {
      return null;
    }

    try {
      const live = await relationalDb.db.live.query<T>(
        sql,
        queryParameters ? [...queryParameters] : [],
        (result) => {
          setResult(result);
          setQueryLoading(false);
          retryCount.current = 0; // Reset retry count on success
        },
      );

      return live as LiveQueryType;
    } catch (err: unknown) {
      if (isRelationNotExistError(err) && retryAttempt < MAX_RETRIES) {
        return new Promise((resolve) => {
          retryTimeoutRef.current = setTimeout(() => {
            resolve(executeLiveQuery(sql, queryParameters, retryAttempt + 1));
          }, RETRY_DELAY);
        });
      }

      setQueryLoading(false);
      setError(err instanceof Error ? err : new Error(String(err)));
      return null;
    }
  };

  useEffect(() => {
    setError(undefined);
    setQueryLoading(true);
    retryCount.current = 0;

    if (!relationalDb.db) {
      return;
    }

    // Use processor's query method to get namespaced database
    const namespace = ProcessorClass.getNamespace(driveId);
    const db = relationalDb.db.queryNamespace<Schema>(namespace);

    const compiledQuery = queryCallback(db, parameters);
    const { sql, parameters: queryParameters } = compiledQuery;

    const liveQueryPromise = executeLiveQuery(sql, queryParameters);

    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      void liveQueryPromise.then((live) => {
        if (live?.unsubscribe) {
          live.unsubscribe();
        }
      });
    };
  }, [relationalDb.db, ProcessorClass, driveId, queryCallback, parameters]);

  return {
    isLoading: relationalDb.isLoading || queryLoading,
    error: error || relationalDb.error,
    result,
  } as const;
}
