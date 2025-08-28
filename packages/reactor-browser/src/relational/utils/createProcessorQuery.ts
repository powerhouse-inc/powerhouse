import type { LiveQueryResults } from "@electric-sql/pglite/live";
import type {
  IRelationalQueryBuilder,
  RelationalDbProcessorClass,
} from "document-drive";
import type { CompiledQuery } from "kysely";
import deepEqual from "lodash.isequal";
import { useCallback, useMemo, useRef } from "react";
import type {
  QueryCallbackReturnType,
  useRelationalQueryOptions,
} from "../hooks/useRelationalQuery.js";
import { useRelationalQuery } from "../hooks/useRelationalQuery.js";

// Custom hook for parameter memoization
function useStableParams<T>(params: T): T {
  const prevParamsRef = useRef<T>();

  return useMemo(() => {
    if (!deepEqual(prevParamsRef.current, params)) {
      prevParamsRef.current = params;
    }
    return prevParamsRef.current as T;
  }, [params]);
}

export function createProcessorQuery<TSchema>(
  ProcessorClass: RelationalDbProcessorClass<TSchema>,
) {
  // Overload for queries without parameters
  function useQuery<
    TQueryBuilder extends (
      db: IRelationalQueryBuilder<TSchema>,
    ) => QueryCallbackReturnType,
  >(
    driveId: string,
    queryCallback: TQueryBuilder,
  ): {
    isLoading: boolean;
    error: Error | null;
    result: LiveQueryResults<
      ReturnType<TQueryBuilder> extends CompiledQuery<infer R> ? R : any
    > | null;
  };

  // Overload for queries with parameters
  function useQuery<
    TParams,
    TQueryBuilder extends (
      db: IRelationalQueryBuilder<TSchema>,
      parameters: TParams,
    ) => QueryCallbackReturnType,
  >(
    driveId: string,
    queryCallback: TQueryBuilder,
    parameters: TParams,
    options?: useRelationalQueryOptions,
  ): {
    isLoading: boolean;
    error: Error | null;
    result: LiveQueryResults<
      ReturnType<TQueryBuilder> extends CompiledQuery<infer R> ? R : any
    > | null;
  };

  function useQuery<
    TParams,
    TQueryBuilder extends (
      db: IRelationalQueryBuilder<TSchema>,
      parameters?: TParams,
    ) => QueryCallbackReturnType,
  >(
    driveId: string,
    queryCallback: TQueryBuilder,
    parameters?: TParams,
    options?: useRelationalQueryOptions,
  ): {
    isLoading: boolean;
    error: Error | null;
    result: LiveQueryResults<
      ReturnType<TQueryBuilder> extends CompiledQuery<infer R> ? R : any
    > | null;
  } {
    type InferredResult =
      ReturnType<TQueryBuilder> extends CompiledQuery<infer R> ? R : any;

    // Automatically memoize parameters using deep comparison
    const stableParams = useStableParams(parameters);

    // Memoize the callback to prevent infinite loops, updating when parameters change
    const memoizedCallback = useCallback(queryCallback, [stableParams]);

    return useRelationalQuery<TSchema, InferredResult, TParams>(
      ProcessorClass,
      driveId,
      memoizedCallback,
      stableParams,
      options,
    ) as {
      isLoading: boolean;
      error: Error | null;
      result: LiveQueryResults<InferredResult> | null;
    };
  }

  return useQuery;
}
