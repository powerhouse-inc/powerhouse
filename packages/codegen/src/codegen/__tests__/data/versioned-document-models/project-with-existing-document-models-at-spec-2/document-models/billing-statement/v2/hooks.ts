import type { DocumentDispatch } from "@powerhousedao/reactor-browser";
import {
  useDocumentsInSelectedDrive,
  useDocumentsInSelectedFolder,
  useDocumentById,
  useSelectedDocument,
} from "@powerhousedao/reactor-browser";
import type {
  BillingStatementDocument,
  BillingStatementAction,
} from "test/document-models/billing-statement/v2";
import { isBillingStatementDocument } from "./gen/document-schema.js";

/** Hook to get a BillingStatement document by its id */
export function useBillingStatementDocumentById(
  documentId: string | null | undefined,
):
  | [BillingStatementDocument, DocumentDispatch<BillingStatementAction>]
  | [undefined, undefined] {
  const [document, dispatch] = useDocumentById(documentId);
  if (!isBillingStatementDocument(document)) return [undefined, undefined];
  return [document, dispatch];
}

/** Hook to get the selected BillingStatement document */
export function useSelectedBillingStatementDocument():
  | [BillingStatementDocument, DocumentDispatch<BillingStatementAction>]
  | [undefined, undefined] {
  const [document, dispatch] = useSelectedDocument();
  if (!isBillingStatementDocument(document)) return [undefined, undefined];
  return [document, dispatch];
}

/** Hook to get all BillingStatement documents in the selected drive */
export function useBillingStatementDocumentsInSelectedDrive() {
  const documentsInSelectedDrive = useDocumentsInSelectedDrive();
  return documentsInSelectedDrive?.filter(isBillingStatementDocument);
}

/** Hook to get all BillingStatement documents in the selected folder */
export function useBillingStatementDocumentsInSelectedFolder() {
  const documentsInSelectedFolder = useDocumentsInSelectedFolder();
  return documentsInSelectedFolder?.filter(isBillingStatementDocument);
}
