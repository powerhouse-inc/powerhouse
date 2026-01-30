import type { Operation } from "document-model";
import { useCallback, useEffect, useRef, useState } from "react";
import { useReactorClient } from "./reactor.js";

type InternalState = {
  globalOperations: Operation[];
  localOperations: Operation[];
  isLoading: boolean;
  error: Error | undefined;
};

type DocumentOperationsState = InternalState & {
  refetch: () => void;
};

/**
 * Hook to fetch document operations via the reactor client.
 * Operations are no longer auto-populated on documents and must be fetched explicitly.
 *
 * @param documentId - The document ID to fetch operations for
 * @returns Object containing globalOperations, localOperations, isLoading, and error
 */
export function useDocumentOperations(
  documentId: string | null | undefined,
): DocumentOperationsState {
  const reactorClient = useReactorClient();
  const hasFetchedRef = useRef(false);
  const [state, setState] = useState<InternalState>(() => ({
    globalOperations: [],
    localOperations: [],
    isLoading: !!documentId,
    error: undefined,
  }));

  const fetchOperations = useCallback(
    async (retryCount = 0): Promise<void> => {
      const MAX_RETRIES = 5;
      const RETRY_DELAY_MS = 500;

      if (!documentId || !reactorClient) {
        setState({
          globalOperations: [],
          localOperations: [],
          isLoading: false,
          error: undefined,
        });
        return;
      }

      setState((prev) => ({ ...prev, isLoading: true, error: undefined }));

      let globalOps: Operation[] = [];
      let localOps: Operation[] = [];
      let fetchError: Error | undefined;

      try {
        const globalResult = await reactorClient.getOperations(documentId, {
          scopes: ["global"],
        });
        globalOps = globalResult.results;
      } catch (err) {
        fetchError = err instanceof Error ? err : new Error(String(err));
      }

      if (!fetchError) {
        try {
          const localResult = await reactorClient.getOperations(documentId, {
            scopes: ["local"],
          });
          localOps = localResult.results;
        } catch (err) {
          fetchError = err instanceof Error ? err : new Error(String(err));
        }
      }

      // If no operations found and we haven't exhausted retries, wait and try again
      // This handles eventual consistency where operations may not be immediately available
      if (
        !fetchError &&
        globalOps.length === 0 &&
        localOps.length === 0 &&
        retryCount < MAX_RETRIES
      ) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        return fetchOperations(retryCount + 1);
      }

      setState({
        globalOperations: globalOps,
        localOperations: localOps,
        isLoading: false,
        error: fetchError,
      });
      hasFetchedRef.current = true;
    },
    [documentId, reactorClient],
  );

  useEffect(() => {
    if (documentId && reactorClient) {
      void fetchOperations();
    } else if (!documentId) {
      setState({
        globalOperations: [],
        localOperations: [],
        isLoading: false,
        error: undefined,
      });
      hasFetchedRef.current = false;
    }
  }, [documentId, reactorClient, fetchOperations]);

  // Wrap fetchOperations to hide the internal retry parameter
  const refetch = useCallback(() => {
    void fetchOperations(0);
  }, [fetchOperations]);

  return { ...state, refetch };
}
