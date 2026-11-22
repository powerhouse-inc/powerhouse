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
  WorkBreakdownStructureAction,
  WorkBreakdownStructureDocument,
} from "document-models/work-breakdown-structure/v1";
import {
  assertIsWorkBreakdownStructureDocument,
  isWorkBreakdownStructureDocument,
} from "./gen/document-schema.js";

/** Hook to get a WorkBreakdownStructure document by its id */
export function useWorkBreakdownStructureDocumentById(
  documentId: string | null | undefined,
):
  | [
      WorkBreakdownStructureDocument,
      DocumentDispatch<WorkBreakdownStructureAction>,
    ]
  | [undefined, undefined] {
  const [document, dispatch] = useDocumentById(documentId);
  if (!isWorkBreakdownStructureDocument(document))
    return [undefined, undefined];
  return [document, dispatch];
}

/** Hook to get the selected WorkBreakdownStructure document */
export function useSelectedWorkBreakdownStructureDocument(): [
  WorkBreakdownStructureDocument,
  DocumentDispatch<WorkBreakdownStructureAction>,
] {
  const [document, dispatch] = useSelectedDocument();

  assertIsWorkBreakdownStructureDocument(document);
  return [document, dispatch] as const;
}

/** Hook to get all WorkBreakdownStructure documents in the selected drive */
export function useWorkBreakdownStructureDocumentsInSelectedDrive() {
  const documentsInSelectedDrive = useDocumentsInSelectedDrive();
  return documentsInSelectedDrive?.filter(isWorkBreakdownStructureDocument);
}

/** Hook to get all WorkBreakdownStructure documents in the selected folder */
export function useWorkBreakdownStructureDocumentsInSelectedFolder() {
  const documentsInSelectedFolder = useDocumentsInSelectedFolder();
  return documentsInSelectedFolder?.filter(isWorkBreakdownStructureDocument);
}
