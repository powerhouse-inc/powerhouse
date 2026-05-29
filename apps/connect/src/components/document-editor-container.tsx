import { DocumentEditor } from "@powerhousedao/connect/components";
import {
  setSelectedNode,
  useNodeParentFolderById,
  useSelectedDocument,
} from "@powerhousedao/reactor-browser";
import { useCallback, useMemo } from "react";

export function DocumentEditorContainer() {
  const [selectedDocument] = useSelectedDocument();
  const parentFolder = useNodeParentFolderById(selectedDocument.header.id);

  // TODO: unused
  const _onOpenSwitchboardLink = useMemo(() => {
    return async () => {
      //
    };
  }, []);

  const _onClose = useCallback(() => {
    setSelectedNode(parentFolder);
  }, [parentFolder, setSelectedNode]);

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
