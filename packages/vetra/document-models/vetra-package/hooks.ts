import type { DocumentDispatch } from "@powerhousedao/reactor-browser";
import {
  useDocumentById,
  useDocumentsInSelectedDrive,
  useDocumentsInSelectedFolder,
  useSelectedDocument,
} from "@powerhousedao/reactor-browser";
import type {
  VetraPackageAction,
  VetraPackageDocument,
} from "@powerhousedao/vetra/document-models/vetra-package";
import {
  assertIsVetraPackageDocument,
  isVetraPackageDocument,
} from "./gen/document-schema.js";

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
export function useSelectedVetraPackageDocument(): [
  VetraPackageDocument,
  DocumentDispatch<VetraPackageAction>,
] {
  const [document, dispatch] = useSelectedDocument();

  assertIsVetraPackageDocument(document);
  return [document, dispatch] as const;
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
