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
  BrandSheetAction,
  BrandSheetDocument,
} from "document-models/brand-sheet/v1";
import {
  assertIsBrandSheetDocument,
  isBrandSheetDocument,
} from "./gen/document-schema.js";

/** Hook to get a BrandSheet document by its id */
export function useBrandSheetDocumentById(
  documentId: string | null | undefined,
):
  | [BrandSheetDocument, DocumentDispatch<BrandSheetAction>]
  | [undefined, undefined] {
  const [document, dispatch] = useDocumentById(documentId);
  if (!isBrandSheetDocument(document)) return [undefined, undefined];
  return [document, dispatch];
}

/** Hook to get the selected BrandSheet document */
export function useSelectedBrandSheetDocument(): [
  BrandSheetDocument,
  DocumentDispatch<BrandSheetAction>,
] {
  const [document, dispatch] = useSelectedDocument();

  assertIsBrandSheetDocument(document);
  return [document, dispatch] as const;
}

/** Hook to get all BrandSheet documents in the selected drive */
export function useBrandSheetDocumentsInSelectedDrive() {
  const documentsInSelectedDrive = useDocumentsInSelectedDrive();
  return documentsInSelectedDrive?.filter(isBrandSheetDocument);
}

/** Hook to get all BrandSheet documents in the selected folder */
export function useBrandSheetDocumentsInSelectedFolder() {
  const documentsInSelectedFolder = useDocumentsInSelectedFolder();
  return documentsInSelectedFolder?.filter(isBrandSheetDocument);
}
