import { useAllowedDocumentTypes } from "./config/editor.js";
import { useSupportedDocumentTypes } from "./supported-document-types.js";

/** Returns the document types a drive editor supports.
 *
 * If present, uses the `allowedDocumentTypes` config value.
 * Otherwise, uses the supported document types from the reactor.
 */
export function useDocumentTypes() {
  const allowedDocumentTypes = useAllowedDocumentTypes();
  const supportedDocumentTypes = useSupportedDocumentTypes();
  return allowedDocumentTypes ?? supportedDocumentTypes;
}
