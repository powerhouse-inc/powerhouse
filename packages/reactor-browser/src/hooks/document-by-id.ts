import type { Action, PHDocument } from "document-model";
import { useAllDocuments } from "./all-documents.js";
import { useDispatch } from "./dispatch.js";

/** Returns a document by id. */
export function useDocumentById(id: string | null | undefined) {
  const documents = useAllDocuments();
  const document = documents?.find((d) => d.header.id === id);
  const [, dispatch] = useDispatch<PHDocument, Action>(document);
  return [document, dispatch] as const;
}
