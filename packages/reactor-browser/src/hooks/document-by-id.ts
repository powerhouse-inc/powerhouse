import type { Action, PHDocument } from "document-model";
import { useDispatch } from "./dispatch.js";
import { useDocument, useDocuments } from "./document-cache.js";

/** Returns a document by id. */
export function useDocumentById(id: string | null | undefined) {
  const document = useDocument(id);
  const [, dispatch] = useDispatch<PHDocument, Action>(document);
  return [document, dispatch] as const;
}

/** Returns documents by ids. */
export function useDocumentsByIds(ids: string[] | null | undefined) {
  return useDocuments(ids);
}
