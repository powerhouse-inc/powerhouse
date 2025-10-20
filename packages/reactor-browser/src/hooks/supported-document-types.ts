import { useReactor } from "./reactor.js";

/** Returns the supported document types for the reactor (derived from the document model modules) */
export function useSupportedDocumentTypesInReactor() {
  const reactor = useReactor();
  return reactor
    ?.getDocumentModelModules()
    .map((module) => module.documentModel.global.id);
}
