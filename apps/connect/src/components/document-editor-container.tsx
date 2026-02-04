import { DocumentEditor } from "@powerhousedao/connect/components";
import { toast } from "@powerhousedao/connect/services";
import {
  exportFile,
  setSelectedNode,
  showPHModal,
  useNodeParentFolderById,
  useSelectedDocument,
  validateDocument,
} from "@powerhousedao/reactor-browser";
import { useCallback, useMemo } from "react";

export function DocumentEditorContainer() {
  const [selectedDocument] = useSelectedDocument();
  const parentFolder = useNodeParentFolderById(selectedDocument.header.id);

  const onExport = useCallback(() => {
    const validationErrors = validateDocument(selectedDocument);

    if (validationErrors.length) {
      showPHModal({
        type: "exportDocumentWithErrors",
        documentId: selectedDocument.header.id,
      });
    } else {
      exportFile(selectedDocument).catch((error: any) => {
        console.error(error);
        const errorMessage =
          error instanceof Error
            ? error.message
            : JSON.stringify(error, null, 1);
        toast(`Failed to export document: ${errorMessage}`);
      });
    }
  }, [selectedDocument]);

  // TODO: unused
  const onOpenSwitchboardLink = useMemo(() => {
    return async () => {
      //
    };
  }, []);

  const onClose = useCallback(() => {
    setSelectedNode(parentFolder);
  }, [parentFolder, setSelectedNode]);

  return (
    <div
      id="document-editor-container"
      className="flex-1"
      data-document-type={selectedDocument.header.documentType}
    >
      <DocumentEditor
        document={selectedDocument}
        onClose={onClose}
        onExport={onExport}
        onOpenSwitchboardLink={onOpenSwitchboardLink}
      />
    </div>
  );
}
