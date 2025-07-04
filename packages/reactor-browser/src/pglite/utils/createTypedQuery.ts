import { type LiveQueryResults } from "@electric-sql/pglite/live";
import { type CompiledQuery, type Kysely } from "kysely";
import deepEqual from "lodash.isequal";
import { useCallback, useMemo, useRef } from "react";

import {
  type QueryCallbackReturnType,
  useLiveQuery,
} from "../hooks/useLiveQuery.js";

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

export function createTypedQuery<Schema>() {
  // Overload for queries without parameters
  function useQuery<
    TQueryBuilder extends (db: Kysely<Schema>) => QueryCallbackReturnType,
  >(
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
      db: Kysely<Schema>,
      parameters: TParams,
    ) => QueryCallbackReturnType,
  >(
    queryCallback: TQueryBuilder,
    parameters: TParams,
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
      db: Kysely<Schema>,
      parameters?: TParams,
    ) => QueryCallbackReturnType,
  >(
    queryCallback: TQueryBuilder,
    parameters?: TParams,
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

    return useLiveQuery<Schema, InferredResult, TParams>(
      memoizedCallback,
      stableParams,
    ) as {
      isLoading: boolean;
      error: Error | null;
      result: LiveQueryResults<InferredResult> | null;
    };
  }

  return useQuery;
}
