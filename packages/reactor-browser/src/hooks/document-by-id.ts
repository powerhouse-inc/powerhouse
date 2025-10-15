import type { Action, PHDocument } from "document-model";
import { useDispatch } from "./dispatch.js";
import { useDocumentsInSelectedDrive } from "./items-in-selected-drive.js";

/** Returns a document by id. */
export function useDocumentById(id: string | null | undefined) {
  const documents = useDocumentsInSelectedDrive();
  const document = documents?.find((d) => d.header.id === id);
  const [, dispatch] = useDispatch<PHDocument, Action>(document);
  return [document, dispatch] as const;
}
