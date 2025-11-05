import type { DocumentDispatch } from "@powerhousedao/reactor-browser";
import {
  useDocumentsInSelectedDrive,
  useDocumentsInSelectedFolder,
  useDocumentById,
  useSelectedDocument,
} from "@powerhousedao/reactor-browser";
import type {
  ProcessorModuleDocument,
  ProcessorModuleAction,
} from "@powerhousedao/vetra/document-models/processor-module";
import { isProcessorModuleDocument } from "@powerhousedao/vetra/document-models/processor-module";

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
export function useSelectedProcessorModuleDocument():
  | [ProcessorModuleDocument, DocumentDispatch<ProcessorModuleAction>]
  | [undefined, undefined] {
  const [document, dispatch] = useSelectedDocument();
  if (!isProcessorModuleDocument(document)) return [undefined, undefined];
  return [document, dispatch];
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
