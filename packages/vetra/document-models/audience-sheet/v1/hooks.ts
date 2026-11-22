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
  AudienceSheetAction,
  AudienceSheetDocument,
} from "document-models/audience-sheet/v1";
import {
  assertIsAudienceSheetDocument,
  isAudienceSheetDocument,
} from "./gen/document-schema.js";

/** Hook to get a AudienceSheet document by its id */
export function useAudienceSheetDocumentById(
  documentId: string | null | undefined,
):
  | [AudienceSheetDocument, DocumentDispatch<AudienceSheetAction>]
  | [undefined, undefined] {
  const [document, dispatch] = useDocumentById(documentId);
  if (!isAudienceSheetDocument(document)) return [undefined, undefined];
  return [document, dispatch];
}

/** Hook to get the selected AudienceSheet document */
export function useSelectedAudienceSheetDocument(): [
  AudienceSheetDocument,
  DocumentDispatch<AudienceSheetAction>,
] {
  const [document, dispatch] = useSelectedDocument();

  assertIsAudienceSheetDocument(document);
  return [document, dispatch] as const;
}

/** Hook to get all AudienceSheet documents in the selected drive */
export function useAudienceSheetDocumentsInSelectedDrive() {
  const documentsInSelectedDrive = useDocumentsInSelectedDrive();
  return documentsInSelectedDrive?.filter(isAudienceSheetDocument);
}

/** Hook to get all AudienceSheet documents in the selected folder */
export function useAudienceSheetDocumentsInSelectedFolder() {
  const documentsInSelectedFolder = useDocumentsInSelectedFolder();
  return documentsInSelectedFolder?.filter(isAudienceSheetDocument);
}
