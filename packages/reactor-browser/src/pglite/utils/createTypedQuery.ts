import { type LiveQueryResults } from "@electric-sql/pglite/live";
import { type CompiledQuery, type Kysely } from "kysely";
import { useCallback } from "react";
import { useLiveQuery } from "../hooks/useLiveQuery.js";

export function createTypedQuery<Schema>() {
  return function useQuery<TQueryBuilder extends (db: Kysely<Schema>) => any>(
    queryCallback: TQueryBuilder,
  ): {
    isLoading: boolean;
    error: Error | null;
    result: LiveQueryResults<
      ReturnType<TQueryBuilder> extends { compile(): CompiledQuery<infer R> }
        ? R
        : never
    > | null;
  } {
    type InferredResult =
      ReturnType<TQueryBuilder> extends {
        compile(): CompiledQuery<infer R>;
      }
        ? R
        : never;

    // Memoize the callback to prevent infinite loops
    const memoizedCallback = useCallback(queryCallback, []);

    return useLiveQuery<Schema>(memoizedCallback) as {
      isLoading: boolean;
      error: Error | null;
      result: LiveQueryResults<InferredResult> | null;
    };
  };
}
