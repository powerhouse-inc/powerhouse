import type { PHDocument } from "document-model";
import { use, useSyncExternalStore } from "react";
import { readPromiseState } from "../reactor.js";
import type { IDocumentCache } from "../types/documents.js";
import type { SetPHGlobalValue, UsePHGlobalValue } from "../types/global.js";
import { makePHEventFunctions } from "./make-ph-event-functions.js";

const documentEventFunctions = makePHEventFunctions("documentCache");

/** Returns all documents in the reactor. */
export const useDocumentCache: UsePHGlobalValue<IDocumentCache> =
  documentEventFunctions.useValue;

/** Sets all of the documents in the reactor. */
export const setDocumentCache: SetPHGlobalValue<IDocumentCache> =
  documentEventFunctions.setValue;

/** Adds an event handler for all of the documents in the reactor. */
export const addDocumentCacheEventHandler =
  documentEventFunctions.addEventHandler;

/**
 * Reads the state of a document promise and converts it to a query state object.
 * @param promise - The document promise to read
 * @returns An object containing the status, data, error, and isPending flag
 */
function getDocumentQueryState(promise: Promise<PHDocument>) {
  const state = readPromiseState(promise);
  switch (state.status) {
    case "pending":
      return {
        status: "pending",
        isPending: true,
        error: undefined,
        data: undefined,
      } as const;
    case "fulfilled":
      return {
        status: "success",
        isPending: false,
        error: undefined,
        data: state.value,
      } as const;
    case "rejected":
      return {
        status: "error",
        isPending: false,
        error: state.reason,
        data: undefined,
      } as const;
  }
}

/**
 * Retrieves a document from the reactor and subscribes to changes using React Suspense.
 * This hook will suspend rendering while the document is loading.
 * @param id - The document ID to retrieve, or null/undefined to skip retrieval
 * @returns The document if found, or undefined if id is null/undefined
 */
export function useGetDocument(id: string | null | undefined) {
  const documentCache = useDocumentCache();
  const document = useSyncExternalStore(
    (cb) => (id && documentCache ? documentCache.subscribe(id, cb) : () => {}),
    () => (id ? documentCache?.get(id) : undefined),
  );
  return document ? use(document) : undefined;
}

/**
 * Retrieves multiple documents from the reactor using React Suspense.
 * This hook will suspend rendering while any of the documents are loading.
 * @param ids - Array of document IDs to retrieve, or null/undefined to skip retrieval
 * @returns An array of documents if found, or undefined if ids is null/undefined
 */
export function useGetDocuments(ids: string[] | null | undefined) {
  const documentCache = useDocumentCache();
  if (!ids || !documentCache) {
    return [];
  }
  const documents: PHDocument[] = [];
  for (const id of ids) {
    const doc = use(documentCache.get(id));
    documents.push(doc);
  }
  return documents;
}

/**
 * Retrieves a document from the reactor without suspending rendering.
 * Returns the current state of the document loading operation.
 * @param id - The document ID to retrieve, or null/undefined to skip retrieval
 * @returns An object containing:
 *   - status: "initial" | "pending" | "success" | "error"
 *   - data: The document if successfully loaded
 *   - isPending: Boolean indicating if the document is currently loading
 *   - error: Any error that occurred during loading
 *   - reload: Function to force reload the document from cache
 */
export function useGetDocumentAsync(id: string | null | undefined) {
  const documentCache = useDocumentCache();
  if (!id || !documentCache) {
    return {
      status: "initial",
      data: undefined,
      isPending: false,
      error: undefined,
      reload: undefined,
    } as const;
  }

  const promise = documentCache.get(id);
  const state = getDocumentQueryState(promise);

  return { ...state, reload: () => documentCache.get(id, true) } as const;
}
