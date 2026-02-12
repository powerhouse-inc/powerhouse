import type { DocumentDispatch } from "@powerhousedao/reactor-browser";
import {
  useDocumentById,
  useDocumentsInSelectedDrive,
  useDocumentsInSelectedFolder,
  useSelectedDocument,
} from "@powerhousedao/reactor-browser";
import type {
  SubgraphModuleAction,
  SubgraphModuleDocument,
} from "@powerhousedao/vetra/document-models/subgraph-module";
import {
  assertIsSubgraphModuleDocument,
  isSubgraphModuleDocument,
} from "./gen/document-schema.js";

/** Hook to get a SubgraphModule document by its id */
export function useSubgraphModuleDocumentById(
  documentId: string | null | undefined,
):
  | [SubgraphModuleDocument, DocumentDispatch<SubgraphModuleAction>]
  | [undefined, undefined] {
  const [document, dispatch] = useDocumentById(documentId);
  if (!isSubgraphModuleDocument(document)) return [undefined, undefined];
  return [document, dispatch];
}

/** Hook to get the selected SubgraphModule document */
export function useSelectedSubgraphModuleDocument(): [
  SubgraphModuleDocument,
  DocumentDispatch<SubgraphModuleAction>,
] {
  const [document, dispatch] = useSelectedDocument();

  assertIsSubgraphModuleDocument(document);
  return [document, dispatch] as const;
}

/** Hook to get all SubgraphModule documents in the selected drive */
export function useSubgraphModuleDocumentsInSelectedDrive() {
  const documentsInSelectedDrive = useDocumentsInSelectedDrive();
  return documentsInSelectedDrive?.filter(isSubgraphModuleDocument);
}

/** Hook to get all SubgraphModule documents in the selected folder */
export function useSubgraphModuleDocumentsInSelectedFolder() {
  const documentsInSelectedFolder = useDocumentsInSelectedFolder();
  return documentsInSelectedFolder?.filter(isSubgraphModuleDocument);
}
