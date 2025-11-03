import type { DocumentDispatch } from "@powerhousedao/reactor-browser";
import {
  useDocumentsInSelectedDrive,
  useDocumentsInSelectedFolder,
  useDocumentById,
  useSelectedDocument,
} from "@powerhousedao/reactor-browser";
import type {
  TestDocDocument,
  TestDocAction,
} from "test/document-models/test-doc";
import { isTestDocDocument } from "test/document-models/test-doc";

/** Hook to get a TestDoc document by its id */
export function useTestDocDocumentById(
  documentId: string | null | undefined,
): [TestDocDocument, DocumentDispatch<TestDocAction>] | [undefined, undefined] {
  const [document, dispatch] = useDocumentById(documentId);
  if (!isTestDocDocument(document)) return [undefined, undefined];
  return [document, dispatch];
}

/** Hook to get the selected TestDoc document */
export function useSelectedTestDocDocument():
  | [TestDocDocument, DocumentDispatch<TestDocAction>]
  | [undefined, undefined] {
  const [document, dispatch] = useSelectedDocument();
  if (!isTestDocDocument(document)) return [undefined, undefined];
  return [document, dispatch];
}

/** Hook to get all TestDoc documents in the selected drive */
export function useTestDocDocumentsInSelectedDrive() {
  const documentsInSelectedDrive = useDocumentsInSelectedDrive();
  return documentsInSelectedDrive?.filter(isTestDocDocument);
}

/** Hook to get all TestDoc documents in the selected folder */
export function useTestDocDocumentsInSelectedFolder() {
  const documentsInSelectedFolder = useDocumentsInSelectedFolder();
  return documentsInSelectedFolder?.filter(isTestDocDocument);
}
