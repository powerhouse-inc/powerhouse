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
  ProcessorModuleAction,
  ProcessorModuleDocument,
} from "document-models/processor-module/v1";
import {
  assertIsProcessorModuleDocument,
  isProcessorModuleDocument,
} from "./gen/document-schema.js";

/** Hook to get a ProcessorModule document by its id */
export function useProcessorModuleDocumentById(
  documentId: string | null | undefined,
):
  | [ProcessorModuleDocument, DocumentDispatch<ProcessorModuleAction>]
  | [undefined, undefined] {
  const [document, dispatch] = useDocumentById(documentId);
  if (!isProcessorModuleDocument(document)) return [undefined, undefined];
  return [document, dispatch];
}

/** Hook to get the selected ProcessorModule document */
export function useSelectedProcessorModuleDocument(): [
  ProcessorModuleDocument,
  DocumentDispatch<ProcessorModuleAction>,
] {
  const [document, dispatch] = useSelectedDocument();

  assertIsProcessorModuleDocument(document);
  return [document, dispatch] as const;
}

/** Hook to get all ProcessorModule documents in the selected drive */
export function useProcessorModuleDocumentsInSelectedDrive() {
  const documentsInSelectedDrive = useDocumentsInSelectedDrive();
  return documentsInSelectedDrive?.filter(isProcessorModuleDocument);
}

/** Hook to get all ProcessorModule documents in the selected folder */
export function useProcessorModuleDocumentsInSelectedFolder() {
  const documentsInSelectedFolder = useDocumentsInSelectedFolder();
  return documentsInSelectedFolder?.filter(isProcessorModuleDocument);
}
