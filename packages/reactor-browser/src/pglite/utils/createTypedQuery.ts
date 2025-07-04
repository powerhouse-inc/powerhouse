import { type LiveQueryResults } from "@electric-sql/pglite/live";
import { type CompiledQuery, type Kysely } from "kysely";
import { useCallback } from "react";
import {
  type QueryCallbackReturnType,
  useLiveQuery,
} from "../hooks/useLiveQuery.js";

export function createTypedQuery<Schema>() {
  return function useQuery<
    TQueryBuilder extends (db: Kysely<Schema>) => QueryCallbackReturnType,
  >(
    queryCallback: TQueryBuilder,
  ): {
    isLoading: boolean;
    error: Error | null;
    result: LiveQueryResults<
      ReturnType<TQueryBuilder> extends CompiledQuery<infer R> ? R : any
    > | null;
  } {
    type InferredResult =
      ReturnType<TQueryBuilder> extends CompiledQuery<infer R> ? R : any;

    // Memoize the callback to prevent infinite loops
    const memoizedCallback = useCallback(queryCallback, []);

    return useLiveQuery<Schema, InferredResult>(memoizedCallback) as {
      isLoading: boolean;
      error: Error | null;
      result: LiveQueryResults<InferredResult> | null;
    };
  };
}
