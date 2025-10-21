import { useDocumentModelModules } from "./document-model-modules.js";

/** Returns the supported document types for the reactor (derived from the document model modules) */
export function useSupportedDocumentTypesInReactor() {
  const documentModelModules = useDocumentModelModules();
  return documentModelModules?.map((module) => module.documentModel.global.id);
}
