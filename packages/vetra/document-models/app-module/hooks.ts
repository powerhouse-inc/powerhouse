import type { DocumentDispatch } from "@powerhousedao/reactor-browser";
import {
  useDocumentsInSelectedDrive,
  useDocumentsInSelectedFolder,
  useDocumentById,
  useSelectedDocument,
} from "@powerhousedao/reactor-browser";
import type {
  AppModuleDocument,
  AppModuleAction,
} from "@powerhousedao/vetra/document-models/app-module";
import { isAppModuleDocument } from "./gen/document-schema.js";

/** Hook to get a AppModule document by its id */
export function useAppModuleDocumentById(
  documentId: string | null | undefined,
):
  | [AppModuleDocument, DocumentDispatch<AppModuleAction>]
  | [undefined, undefined] {
  const [document, dispatch] = useDocumentById(documentId);
  if (!isAppModuleDocument(document)) return [undefined, undefined];
  return [document, dispatch];
}

/** Hook to get the selected AppModule document */
export function useSelectedAppModuleDocument():
  | [AppModuleDocument, DocumentDispatch<AppModuleAction>]
  | [undefined, undefined] {
  const [document, dispatch] = useSelectedDocument();
  if (!isAppModuleDocument(document)) return [undefined, undefined];
  return [document, dispatch];
}

/** Hook to get all AppModule documents in the selected drive */
export function useAppModuleDocumentsInSelectedDrive() {
  const documentsInSelectedDrive = useDocumentsInSelectedDrive();
  return documentsInSelectedDrive?.filter(isAppModuleDocument);
}

/** Hook to get all AppModule documents in the selected folder */
export function useAppModuleDocumentsInSelectedFolder() {
  const documentsInSelectedFolder = useDocumentsInSelectedFolder();
  return documentsInSelectedFolder?.filter(isAppModuleDocument);
}
