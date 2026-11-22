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
  FeatureAction,
  FeatureDocument,
} from "document-models/feature/v1";
import {
  assertIsFeatureDocument,
  isFeatureDocument,
} from "./gen/document-schema.js";

/** Hook to get a Feature document by its id */
export function useFeatureDocumentById(
  documentId: string | null | undefined,
): [FeatureDocument, DocumentDispatch<FeatureAction>] | [undefined, undefined] {
  const [document, dispatch] = useDocumentById(documentId);
  if (!isFeatureDocument(document)) return [undefined, undefined];
  return [document, dispatch];
}

/** Hook to get the selected Feature document */
export function useSelectedFeatureDocument(): [
  FeatureDocument,
  DocumentDispatch<FeatureAction>,
] {
  const [document, dispatch] = useSelectedDocument();

  assertIsFeatureDocument(document);
  return [document, dispatch] as const;
}

/** Hook to get all Feature documents in the selected drive */
export function useFeatureDocumentsInSelectedDrive() {
  const documentsInSelectedDrive = useDocumentsInSelectedDrive();
  return documentsInSelectedDrive?.filter(isFeatureDocument);
}

/** Hook to get all Feature documents in the selected folder */
export function useFeatureDocumentsInSelectedFolder() {
  const documentsInSelectedFolder = useDocumentsInSelectedFolder();
  return documentsInSelectedFolder?.filter(isFeatureDocument);
}
