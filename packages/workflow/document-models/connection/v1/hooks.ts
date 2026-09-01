/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { DocumentDispatch } from "@powerhousedao/reactor-browser";
import {
  useDocumentById,
  useDocumentsInSelectedDrive,
  useDocumentsInSelectedFolder,
  useSelectedDocument,
} from "@powerhousedao/reactor-browser";
import type {
  ConnectionAction,
  ConnectionDocument,
} from "document-models/connection/v1";
import {
  assertIsConnectionDocument,
  isConnectionDocument,
} from "./gen/document-schema.js";

/** Hook to get a Connection document by its id */
export function useConnectionDocumentById(
  documentId: string | null | undefined,
):
  | [ConnectionDocument, DocumentDispatch<ConnectionAction>]
  | [undefined, undefined] {
  const [document, dispatch] = useDocumentById(documentId);
  if (!isConnectionDocument(document)) return [undefined, undefined];
  return [document, dispatch];
}

/** Hook to get the selected Connection document */
export function useSelectedConnectionDocument(): [
  ConnectionDocument,
  DocumentDispatch<ConnectionAction>,
] {
  const [document, dispatch] = useSelectedDocument();

  assertIsConnectionDocument(document);
  return [document, dispatch] as const;
}

/** Hook to get all Connection documents in the selected drive */
export function useConnectionDocumentsInSelectedDrive() {
  const documentsInSelectedDrive = useDocumentsInSelectedDrive();
  return documentsInSelectedDrive?.filter(isConnectionDocument);
}

/** Hook to get all Connection documents in the selected folder */
export function useConnectionDocumentsInSelectedFolder() {
  const documentsInSelectedFolder = useDocumentsInSelectedFolder();
  return documentsInSelectedFolder?.filter(isConnectionDocument);
}
