import { useAllowedDocumentTypes } from "./config/editor.js";
import { useSupportedDocumentTypesInReactor } from "./supported-document-types.js";

/** Returns the document types a app supports.
 *
 * Uses the `allowedDocumentTypes` config value when it lists any types.
 * Unset or empty, it means every type, so the reactor's supported types are used.
 */
export function useDocumentTypes() {
  const allowedDocumentTypes = useAllowedDocumentTypes();
  const supportedDocumentTypes = useSupportedDocumentTypesInReactor();
  return allowedDocumentTypes?.length
    ? allowedDocumentTypes
    : supportedDocumentTypes;
}
