import type { DocumentDispatch } from "@powerhousedao/reactor-browser";
import {
  useDocumentsInSelectedDrive,
  useDocumentsInSelectedFolder,
  useDocumentById,
  useSelectedDocument,
} from "@powerhousedao/reactor-browser";
import type {
  TestEmptyCodesDocument,
  TestEmptyCodesAction,
} from "test/document-models/test-empty-codes/v2";
import { isTestEmptyCodesDocument } from "./gen/document-schema.js";

/** Hook to get a TestEmptyCodes document by its id */
export function useTestEmptyCodesDocumentById(
  documentId: string | null | undefined,
):
  | [TestEmptyCodesDocument, DocumentDispatch<TestEmptyCodesAction>]
  | [undefined, undefined] {
  const [document, dispatch] = useDocumentById(documentId);
  if (!isTestEmptyCodesDocument(document)) return [undefined, undefined];
  return [document, dispatch];
}

/** Hook to get the selected TestEmptyCodes document */
export function useSelectedTestEmptyCodesDocument():
  | [TestEmptyCodesDocument, DocumentDispatch<TestEmptyCodesAction>]
  | [undefined, undefined] {
  const [document, dispatch] = useSelectedDocument();
  if (!isTestEmptyCodesDocument(document)) return [undefined, undefined];
  return [document, dispatch];
}

/** Hook to get all TestEmptyCodes documents in the selected drive */
export function useTestEmptyCodesDocumentsInSelectedDrive() {
  const documentsInSelectedDrive = useDocumentsInSelectedDrive();
  return documentsInSelectedDrive?.filter(isTestEmptyCodesDocument);
}

/** Hook to get all TestEmptyCodes documents in the selected folder */
export function useTestEmptyCodesDocumentsInSelectedFolder() {
  const documentsInSelectedFolder = useDocumentsInSelectedFolder();
  return documentsInSelectedFolder?.filter(isTestEmptyCodesDocument);
}
