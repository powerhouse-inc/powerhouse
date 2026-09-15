import type { Operation } from "@powerhousedao/shared/document-model";
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { IDLE_OPERATIONS_ENTRY, isOperationCache } from "../document-cache.js";
import type { IOperationCache } from "../types/documents.js";
import { useDocumentCache } from "./document-cache.js";

export type UseDocumentOperationsOptions = {
  /**
   * Operations per page. Default 100. Applies to the next first-page load;
   * changing it while pages are already loaded has no effect until the next
   * invalidation or `refetch`.
   */
  limit?: number;
  /** Whether to fetch at all. Default true. Pass false until the operations are needed. */
  enabled?: boolean;
};

/** What `useDocumentOperations` returns; exported so consumers can name it. */
export type DocumentOperationsResult = {
  /** Every operation of the scope loaded so far, oldest first. */
  operations: readonly Operation[];
  /** A page is in flight. */
  isLoading: boolean;
  /** The last page failed. Operations loaded before it stay available. */
  error: Error | undefined;
  /** The last page reported a further page. */
  hasNextPage: boolean;
  /** Reported by the GraphQL client only. */
  totalCount: number | undefined;
  /** Loads the next page and appends it. No-op while loading or when there is none. */
  fetchNextPage: () => void;
  /** Drops the document's cached operations and reloads from the first page. */
  refetch: () => void;
};

const DEFAULT_LIMIT = 100;

function toError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error(String(reason));
}

/**
 * Operation history of one scope of a document, read from the document
 * cache and kept in step with it: a change event for the document drops the
 * cached pages and the hook loads the first page again.
 *
 * Pages arrive oldest first. A view that wants the whole history calls
 * `fetchNextPage` while `hasNextPage` is true.
 *
 * An empty first page is a final result; there is no retry. When the active
 * document cache does not serve operations, the result is empty and not
 * loading.
 *
 * @param documentId - The document id, or null/undefined to skip fetching
 * @param scope - The operation scope, for example "global" or "local"
 * @param options - Page size and whether fetching is enabled
 */
export function useDocumentOperations(
  documentId: string | null | undefined,
  scope: string,
  options: UseDocumentOperationsOptions = {},
): DocumentOperationsResult {
  const { limit = DEFAULT_LIMIT, enabled = true } = options;
  const documentCache = useDocumentCache();
  const cache: IOperationCache | undefined =
    documentCache && isOperationCache(documentCache)
      ? documentCache
      : undefined;
  const activeId = enabled && cache && documentId ? documentId : undefined;

  const entry = useSyncExternalStore(
    (onChange) =>
      activeId && cache
        ? cache.subscribeOperations(activeId, onChange)
        : () => {},
    () =>
      activeId && cache
        ? cache.getOperationsState(activeId, scope)
        : IDLE_OPERATIONS_ENTRY,
  );

  useEffect(() => {
    if (activeId && cache && entry.status === "idle") {
      cache.loadOperations(activeId, scope, limit);
    }
  }, [activeId, cache, scope, limit, entry.status]);

  const fetchNextPage = useCallback(() => {
    if (activeId && cache) {
      cache.loadMoreOperations(activeId, scope);
    }
  }, [activeId, cache, scope]);

  const refetch = useCallback(() => {
    if (activeId && cache) {
      cache.invalidateOperations(activeId);
    }
  }, [activeId, cache]);

  const error = useMemo(
    () => (entry.status === "error" ? toError(entry.error) : undefined),
    [entry.status, entry.error],
  );

  return {
    operations: entry.operations,
    // `idle` while active is a load about to be kicked off by the effect
    // above (on mount, and right after `invalidateOperations` clears the
    // entry synchronously) - report it as loading so consumers never see a
    // "no operations" flash before the first page request goes out.
    isLoading:
      entry.status === "pending" || (!!activeId && entry.status === "idle"),
    error,
    hasNextPage: entry.hasNextPage,
    totalCount: entry.totalCount,
    fetchNextPage,
    refetch,
  };
}
