import {
  useDocumentsInSelectedDrive,
  useSupportedDocumentTypes,
} from "@powerhousedao/reactor-browser";

const DEFAULT_DRIVE_ID = "vetra";

export function useAvailableDocumentTypes(
  onlyVetraDocuments = false,
): string[] {
  const supportedDocumentTypes = useSupportedDocumentTypes() ?? [];
  const documents = useDocumentsInSelectedDrive();
  const documentModelTypeDocuments = documents?.filter(
    (document) => document.header.documentType === "powerhouse/document-model",
  );
  const documentTypesFromDocuments =
    documentModelTypeDocuments?.map(
      (document) => document.header.documentType,
    ) ?? [];
  if (onlyVetraDocuments) {
    return documentTypesFromDocuments;
  }
  return [
    ...new Set([...supportedDocumentTypes, ...documentTypesFromDocuments]),
  ];
}
