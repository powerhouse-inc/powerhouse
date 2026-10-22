import type {
  DocumentModelModule,
  PHBaseState,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import { use, useMemo, useSyncExternalStore } from "react";
import {
  IDLE_DOCUMENTS_OF_TYPE_ENTRY,
  isDocumentTypeCache,
} from "../document-cache.js";
import type { IDocumentCache } from "../types/documents.js";
import { useDocumentCache, useDocuments } from "./document-cache.js";
import { getPHStore } from "./ph-store.js";

export type DocumentsOfTypeOptions = {
  /** Documents per page; 25 by default. */
  limit?: number;
};

export type DocumentsOfType<TState extends PHBaseState> = {
  /** The loaded pages' documents that pass the module's schema. */
  documents: PHDocument<TState>[];
  /** Documents of the type that fail it, e.g. written by another version of the model. */
  invalid: PHDocument[];
  hasNextPage: boolean;
  isLoadingNextPage: boolean;
  /** Loads the next page; does nothing while one loads or when there is none. */
  loadNextPage: () => void;
  /** The last failure loading a further page; a failed first page throws. */
  error: unknown;
};

const DEFAULT_LIMIT = 25;

const NO_DOCUMENTS = {
  documents: [],
  invalid: [],
  hasNextPage: false,
  isLoadingNextPage: false,
  loadNextPage: () => undefined,
  error: undefined,
};

type ModelOf = Pick<DocumentModelModule, "documentModel">;
const typeOf = (module: ModelOf) => module.documentModel.global.id;

function typeCacheOf(cache: IDocumentCache | undefined) {
  if (!cache) return undefined;
  if (!isDocumentTypeCache(cache)) {
    throw new Error("This document cache can't list documents by type.");
  }
  return cache;
}

/** The documents of `module`'s type across every drive, a page at a time and
 * checked against its schema; suspends until the first page has loaded. */
export function useDocumentsOfType<TState extends PHBaseState>(
  module: DocumentModelModule<TState>,
  { limit = DEFAULT_LIMIT }: DocumentsOfTypeOptions = {},
): DocumentsOfType<TState> {
  const cache = typeCacheOf(useDocumentCache());
  const type = typeOf(module);
  const read = () =>
    cache?.getDocumentsOfTypeState(type, limit) ?? IDLE_DOCUMENTS_OF_TYPE_ENTRY;
  const entry = useSyncExternalStore(
    (onChange) =>
      cache ? cache.subscribeDocumentsOfType(type, limit, onChange) : () => {},
    read,
    read,
  );
  if (cache) use(cache.loadDocumentsOfType(type, limit));
  if (entry.status === "error" && entry.ids.length === 0) throw entry.error;

  const loaded = useDocuments(entry.ids as string[]);
  const [documents, invalid] = useMemo(() => {
    const valid: PHDocument<TState>[] = [];
    const other: PHDocument[] = [];
    for (const document of loaded) {
      if (module.utils.isDocumentOfType(document)) valid.push(document);
      else other.push(document);
    }
    return [valid, other] as const;
  }, [loaded, module]);

  if (!cache) return NO_DOCUMENTS;
  return {
    documents,
    invalid,
    hasNextPage: entry.hasNextPage,
    isLoadingNextPage: entry.status === "pending",
    loadNextPage: () => cache.loadMoreDocumentsOfType(type, limit),
    error: entry.status === "error" ? entry.error : undefined,
  };
}

/** Loads the first page `useDocumentsOfType` reads, e.g. in a route loader, so it doesn't suspend. */
export async function loadDocumentsOfType(
  module: ModelOf,
  { limit = DEFAULT_LIMIT }: DocumentsOfTypeOptions = {},
): Promise<void> {
  const cache = typeCacheOf(getPHStore()?.documentCache);
  await cache?.loadDocumentsOfType(typeOf(module), limit);
}
