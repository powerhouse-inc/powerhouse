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
  ReactorGroupAction,
  ReactorGroupDocument,
} from "document-models/reactor-group/v1";
import {
  assertIsReactorGroupDocument,
  isReactorGroupDocument,
} from "./gen/document-schema.js";

/** Hook to get a ReactorGroup document by its id */
export function useReactorGroupDocumentById(
  documentId: string | null | undefined,
):
  | [ReactorGroupDocument, DocumentDispatch<ReactorGroupAction>]
  | [undefined, undefined] {
  const [document, dispatch] = useDocumentById(documentId);
  if (!isReactorGroupDocument(document)) return [undefined, undefined];
  return [document, dispatch];
}

/** Hook to get the selected ReactorGroup document */
export function useSelectedReactorGroupDocument(): [
  ReactorGroupDocument,
  DocumentDispatch<ReactorGroupAction>,
] {
  const [document, dispatch] = useSelectedDocument();

  assertIsReactorGroupDocument(document);
  return [document, dispatch] as const;
}

/** Hook to get all ReactorGroup documents in the selected drive */
export function useReactorGroupDocumentsInSelectedDrive() {
  const documentsInSelectedDrive = useDocumentsInSelectedDrive();
  return documentsInSelectedDrive?.filter(isReactorGroupDocument);
}

/** Hook to get all ReactorGroup documents in the selected folder */
export function useReactorGroupDocumentsInSelectedFolder() {
  const documentsInSelectedFolder = useDocumentsInSelectedFolder();
  return documentsInSelectedFolder?.filter(isReactorGroupDocument);
}
