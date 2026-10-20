import { DocumentEditor } from "./editors.js";
import {
  setSelectedNode,
  useDocument,
  useNodeParentFolderById,
} from "@powerhousedao/reactor-browser";
import { useCallback, useMemo } from "react";

/** The editor of the document `documentId` names. */
export function DocumentEditorContainer({
  documentId,
}: {
  documentId: string;
}) {
  const selectedDocument = useDocument(documentId);
  const parentFolder = useNodeParentFolderById(documentId);

  // TODO: unused
  const _onOpenSwitchboardLink = useMemo(() => {
    return async () => {
      //
    };
  }, []);

  const _onClose = useCallback(() => {
    setSelectedNode(parentFolder);
  }, [parentFolder]);

  if (!selectedDocument) return null;
  return (
    <div
      id="document-editor-container"
      className="flex-1"
      data-document-type={selectedDocument.header.documentType}
    >
      <DocumentEditor document={selectedDocument} />
    </div>
  );
}
