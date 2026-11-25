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
  ProblemSheetAction,
  ProblemSheetDocument,
} from "document-models/problem-sheet/v1";
import {
  assertIsProblemSheetDocument,
  isProblemSheetDocument,
} from "./gen/document-schema.js";

/** Hook to get a ProblemSheet document by its id */
export function useProblemSheetDocumentById(
  documentId: string | null | undefined,
):
  | [ProblemSheetDocument, DocumentDispatch<ProblemSheetAction>]
  | [undefined, undefined] {
  const [document, dispatch] = useDocumentById(documentId);
  if (!isProblemSheetDocument(document)) return [undefined, undefined];
  return [document, dispatch];
}

/** Hook to get the selected ProblemSheet document */
export function useSelectedProblemSheetDocument(): [
  ProblemSheetDocument,
  DocumentDispatch<ProblemSheetAction>,
] {
  const [document, dispatch] = useSelectedDocument();

  assertIsProblemSheetDocument(document);
  return [document, dispatch] as const;
}

/** Hook to get all ProblemSheet documents in the selected drive */
export function useProblemSheetDocumentsInSelectedDrive() {
  const documentsInSelectedDrive = useDocumentsInSelectedDrive();
  return documentsInSelectedDrive?.filter(isProblemSheetDocument);
}

/** Hook to get all ProblemSheet documents in the selected folder */
export function useProblemSheetDocumentsInSelectedFolder() {
  const documentsInSelectedFolder = useDocumentsInSelectedFolder();
  return documentsInSelectedFolder?.filter(isProblemSheetDocument);
}
