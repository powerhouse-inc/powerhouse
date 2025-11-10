import type { DocumentDispatch } from "@powerhousedao/reactor-browser";
import {
  useDocumentsInSelectedDrive,
  useDocumentsInSelectedFolder,
  useDocumentById,
  useSelectedDocument,
} from "@powerhousedao/reactor-browser";
import type {
  VetraPackageDocument,
  VetraPackageAction,
} from "@powerhousedao/vetra/document-models/vetra-package";
import { isVetraPackageDocument } from "./gen/document-schema.js";

/** Hook to get a VetraPackage document by its id */
export function useVetraPackageDocumentById(
  documentId: string | null | undefined,
):
  | [VetraPackageDocument, DocumentDispatch<VetraPackageAction>]
  | [undefined, undefined] {
  const [document, dispatch] = useDocumentById(documentId);
  if (!isVetraPackageDocument(document)) return [undefined, undefined];
  return [document, dispatch];
}

/** Hook to get the selected VetraPackage document */
export function useSelectedVetraPackageDocument():
  | [VetraPackageDocument, DocumentDispatch<VetraPackageAction>]
  | [undefined, undefined] {
  const [document, dispatch] = useSelectedDocument();
  if (!isVetraPackageDocument(document)) return [undefined, undefined];
  return [document, dispatch];
}

/** Hook to get all VetraPackage documents in the selected drive */
export function useVetraPackageDocumentsInSelectedDrive() {
  const documentsInSelectedDrive = useDocumentsInSelectedDrive();
  return documentsInSelectedDrive?.filter(isVetraPackageDocument);
}

/** Hook to get all VetraPackage documents in the selected folder */
export function useVetraPackageDocumentsInSelectedFolder() {
  const documentsInSelectedFolder = useDocumentsInSelectedFolder();
  return documentsInSelectedFolder?.filter(isVetraPackageDocument);
}
