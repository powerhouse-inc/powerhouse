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
  WorkflowAction,
  WorkflowDocument,
} from "document-models/workflow/v1";
import {
  assertIsWorkflowDocument,
  isWorkflowDocument,
} from "./gen/document-schema.js";

/** Hook to get a Workflow document by its id */
export function useWorkflowDocumentById(
  documentId: string | null | undefined,
):
  | [WorkflowDocument, DocumentDispatch<WorkflowAction>]
  | [undefined, undefined] {
  const [document, dispatch] = useDocumentById(documentId);
  if (!isWorkflowDocument(document)) return [undefined, undefined];
  return [document, dispatch];
}

/** Hook to get the selected Workflow document */
export function useSelectedWorkflowDocument(): [
  WorkflowDocument,
  DocumentDispatch<WorkflowAction>,
] {
  const [document, dispatch] = useSelectedDocument();

  assertIsWorkflowDocument(document);
  return [document, dispatch] as const;
}

/** Hook to get all Workflow documents in the selected drive */
export function useWorkflowDocumentsInSelectedDrive() {
  const documentsInSelectedDrive = useDocumentsInSelectedDrive();
  return documentsInSelectedDrive?.filter(isWorkflowDocument);
}

/** Hook to get all Workflow documents in the selected folder */
export function useWorkflowDocumentsInSelectedFolder() {
  const documentsInSelectedFolder = useDocumentsInSelectedFolder();
  return documentsInSelectedFolder?.filter(isWorkflowDocument);
}
