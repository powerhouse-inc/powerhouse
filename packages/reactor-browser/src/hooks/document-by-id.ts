import type { IDocumentDriveServer } from "document-drive";
import type { Action, PHDocument } from "document-model";
import { use } from "react";
import { useDispatch } from "./dispatch.js";
import { useReactor } from "./reactor.js";

interface IDocumentCache {
  get(id: string, refetch?: boolean): Promise<PHDocument>;
}

function initDocumentCache(reactor: IDocumentDriveServer): IDocumentCache {
  const documents = new Map<string, Promise<PHDocument>>();
  return {
    get(id: string, refetch?: boolean) {
      const document = documents.get(id);
      if (document && !refetch) {
        return document;
      }
      const documentPromise = reactor.getDocument(id);
      documents.set(id, documentPromise);
      return documentPromise;
    },
  };
}

let documentCache: IDocumentCache | undefined;

function useGetDocument(id: string | null | undefined) {
  const reactor = useReactor();
  if (!id || !reactor) {
    return undefined;
  }
  if (!documentCache) {
    documentCache = initDocumentCache(reactor);
  }
  const document = use(documentCache.get(id));
  return document;
}

function useGetDocuments(ids: string[] | null | undefined) {
  const reactor = useReactor();
  if (!ids || !reactor) {
    return undefined;
  }
  if (!documentCache) {
    documentCache = initDocumentCache(reactor);
  }
  const documents: PHDocument[] = [];
  for (const id of ids) {
    const doc = use(documentCache.get(id));
    documents.push(doc);
  }
  return documents;
}

/** Returns a document by id. */
export function useDocumentById(id: string | null | undefined) {
  const document = useGetDocument(id);
  const [, dispatch] = useDispatch<PHDocument, Action>(document);
  return [document, dispatch] as const;
}

/** Returns documents by ids. */
export function useDocumentsByIds(ids: string[] | null | undefined) {
  return useGetDocuments(ids);
}
