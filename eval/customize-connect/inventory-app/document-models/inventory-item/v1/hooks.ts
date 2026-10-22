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
  InventoryItemAction,
  InventoryItemDocument,
} from "document-models/inventory-item/v1";
import {
  assertIsInventoryItemDocument,
  isInventoryItemDocument,
} from "./gen/document-schema.js";

/** Hook to get a InventoryItem document by its id */
export function useInventoryItemDocumentById(
  documentId: string | null | undefined,
):
  | [InventoryItemDocument, DocumentDispatch<InventoryItemAction>]
  | [undefined, undefined] {
  const [document, dispatch] = useDocumentById(documentId);
  if (!isInventoryItemDocument(document)) return [undefined, undefined];
  return [document, dispatch];
}

/** Hook to get the selected InventoryItem document */
export function useSelectedInventoryItemDocument(): [
  InventoryItemDocument,
  DocumentDispatch<InventoryItemAction>,
] {
  const [document, dispatch] = useSelectedDocument();

  assertIsInventoryItemDocument(document);
  return [document, dispatch] as const;
}

/** Hook to get all InventoryItem documents in the selected drive */
export function useInventoryItemDocumentsInSelectedDrive() {
  const documentsInSelectedDrive = useDocumentsInSelectedDrive();
  return documentsInSelectedDrive?.filter(isInventoryItemDocument);
}

/** Hook to get all InventoryItem documents in the selected folder */
export function useInventoryItemDocumentsInSelectedFolder() {
  const documentsInSelectedFolder = useDocumentsInSelectedFolder();
  return documentsInSelectedFolder?.filter(isInventoryItemDocument);
}
