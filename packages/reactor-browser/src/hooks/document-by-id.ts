import type { Action, PHDocument } from "@powerhousedao/shared/document-model";
import type { UseDispatchResult } from "./dispatch.js";
import { useDispatch } from "./dispatch.js";
import { useDocument, useDocuments } from "./document-cache.js";

/** Returns a document by id. */
export function useDocumentById(
  id: string | null | undefined,
): UseDispatchResult<PHDocument, Action> {
  const document = useDocument(id);
  const [, dispatch] = useDispatch<PHDocument, Action>(document);
  return [document, dispatch] as const;
}

/** Returns documents by ids. */
export function useDocumentsByIds(ids: string[] | null | undefined) {
  return useDocuments(ids);
}
