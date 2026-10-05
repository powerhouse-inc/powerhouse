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
  ExpenseReportAction,
  ExpenseReportDocument,
} from "document-models/expense-report/v1";
import {
  assertIsExpenseReportDocument,
  isExpenseReportDocument,
} from "./gen/document-schema.js";

/** Hook to get a ExpenseReport document by its id */
export function useExpenseReportDocumentById(
  documentId: string | null | undefined,
):
  | [ExpenseReportDocument, DocumentDispatch<ExpenseReportAction>]
  | [undefined, undefined] {
  const [document, dispatch] = useDocumentById(documentId);
  if (!isExpenseReportDocument(document)) return [undefined, undefined];
  return [document, dispatch];
}

/** Hook to get the selected ExpenseReport document */
export function useSelectedExpenseReportDocument(): [
  ExpenseReportDocument,
  DocumentDispatch<ExpenseReportAction>,
] {
  const [document, dispatch] = useSelectedDocument();

  assertIsExpenseReportDocument(document);
  return [document, dispatch] as const;
}

/** Hook to get all ExpenseReport documents in the selected drive */
export function useExpenseReportDocumentsInSelectedDrive() {
  const documentsInSelectedDrive = useDocumentsInSelectedDrive();
  return documentsInSelectedDrive?.filter(isExpenseReportDocument);
}

/** Hook to get all ExpenseReport documents in the selected folder */
export function useExpenseReportDocumentsInSelectedFolder() {
  const documentsInSelectedFolder = useDocumentsInSelectedFolder();
  return documentsInSelectedFolder?.filter(isExpenseReportDocument);
}
