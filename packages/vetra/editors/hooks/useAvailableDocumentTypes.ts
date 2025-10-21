import {
  useDocumentsInSelectedDrive,
  useSupportedDocumentTypesInReactor,
} from "@powerhousedao/reactor-browser";
import type { DocumentModelDocument, PHDocument } from "document-model";

function isDocumentModelDocument(
  document: PHDocument,
): document is DocumentModelDocument {
  return document.header.documentType === "powerhouse/document-model";
}

export function useAvailableDocumentTypes(
  onlyDocumentTypesFromDriveDocuments = false,
): string[] {
  const supportedDocumentTypes = useSupportedDocumentTypesInReactor() ?? [];
  const documents = useDocumentsInSelectedDrive() ?? [];
  const documentModelDocumentsInSelectedDrive = documents.filter(
    isDocumentModelDocument,
  );
  const documentTypesFromDocumentModelDocuments =
    documentModelDocumentsInSelectedDrive.map((doc) => doc.state.global.id);

  if (onlyDocumentTypesFromDriveDocuments)
    return [...new Set(documentTypesFromDocumentModelDocuments)];

  return [
    ...new Set([
      ...supportedDocumentTypes,
      ...documentTypesFromDocumentModelDocuments,
    ]),
  ];
}
