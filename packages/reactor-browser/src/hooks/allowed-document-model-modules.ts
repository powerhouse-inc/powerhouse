import { useAllowedDocumentTypes } from "./config/editor.js";
import { useDocumentModelModules } from "./document-model-modules.js";

export function useAllowedDocumentModelModules() {
  const documentModelModules = useDocumentModelModules();
  const allowedDocumentTypes = useAllowedDocumentTypes();
  if (!allowedDocumentTypes?.length) return documentModelModules;
  return documentModelModules?.filter((module) =>
    allowedDocumentTypes.includes(module.documentModel.global.id),
  );
}
