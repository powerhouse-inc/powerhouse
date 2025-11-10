import type { DocumentDispatch } from "@powerhousedao/reactor-browser";
import {
  useDocumentsInSelectedDrive,
  useDocumentsInSelectedFolder,
  useDocumentById,
  useSelectedDocument,
} from "@powerhousedao/reactor-browser";
import type {
  SubgraphModuleDocument,
  SubgraphModuleAction,
} from "@powerhousedao/vetra/document-models/subgraph-module";
import { isSubgraphModuleDocument } from "./gen/document-schema.js";

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
export function useSelectedSubgraphModuleDocument():
  | [SubgraphModuleDocument, DocumentDispatch<SubgraphModuleAction>]
  | [undefined, undefined] {
  const [document, dispatch] = useSelectedDocument();
  if (!isSubgraphModuleDocument(document)) return [undefined, undefined];
  return [document, dispatch];
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
