import type { Operation } from "document-model";
import { useCallback, useEffect, useState } from "react";
import { useReactorClient } from "./reactor.js";

type DocumentOperationsState = {
  globalOperations: Operation[];
  localOperations: Operation[];
  isLoading: boolean;
  error: Error | undefined;
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
  const [state, setState] = useState<DocumentOperationsState>({
    globalOperations: [],
    localOperations: [],
    isLoading: false,
    error: undefined,
  });

  const fetchOperations = useCallback(async () => {
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

    setState({
      globalOperations: globalOps,
      localOperations: localOps,
      isLoading: false,
      error: fetchError,
    });
  }, [documentId, reactorClient]);

  useEffect(() => {
    void fetchOperations();
  }, [fetchOperations]);

  return state;
}
