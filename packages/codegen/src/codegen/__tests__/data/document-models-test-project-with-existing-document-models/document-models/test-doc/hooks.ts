import type { DocumentDispatch } from "@powerhousedao/reactor-browser";
import {
  useDocumentById,
  useDocumentsInSelectedDrive,
  useDocumentsInSelectedFolder,
  useSelectedDocument,
} from "@powerhousedao/reactor-browser";
import {
  assertIsTestDocDocument,
  isTestDocDocument,
} from "./gen/document-schema.js";
import type { TestDocAction, TestDocDocument } from "./gen/types.js";

/** Hook to get a TestDoc document by its id */
export function useTestDocDocumentById(
  documentId: string | null | undefined,
): [TestDocDocument, DocumentDispatch<TestDocAction>] | [undefined, undefined] {
  const [document, dispatch] = useDocumentById(documentId);
  if (!isTestDocDocument(document)) return [undefined, undefined];
  return [document, dispatch];
}

/** Hook to get the selected TestDoc document */
export function useSelectedTestDocDocument(): [
  TestDocDocument,
  DocumentDispatch<TestDocAction>,
] {
  const [document, dispatch] = useSelectedDocument();

  assertIsTestDocDocument(document);
  return [document, dispatch] as const;
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
