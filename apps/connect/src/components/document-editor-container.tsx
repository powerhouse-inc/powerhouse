import { DocumentEditor } from "@powerhousedao/connect/components";
import { toast } from "@powerhousedao/connect/services";
import { openUrl } from "@powerhousedao/connect/utils";
import {
  buildDocumentSubgraphUrl,
  exportFile,
  getDriveIsRemote,
  getDriveRemoteUrl,
  setSelectedNode,
  showPHModal,
  useNodeParentFolderById,
  useSelectedDocument,
  useSelectedDrive,
  validateDocument,
} from "@powerhousedao/reactor-browser";
import { useRenown, useUser } from "@powerhousedao/reactor-browser/connect";
import { useCallback, useMemo } from "react";

export function DocumentEditorContainer() {
  const [selectedDrive] = useSelectedDrive();
  const [selectedDocument] = useSelectedDocument();
  const parentFolder = useNodeParentFolderById(selectedDocument.header.id);
  const isRemoteDrive = getDriveIsRemote(selectedDrive);
  const remoteUrl = getDriveRemoteUrl(selectedDrive);
  const renown = useRenown();
  const user = useUser();

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

  // TODO: fix this mess
  const onOpenSwitchboardLink = useMemo(() => {
    return isRemoteDrive
      ? async () => {
          if (!selectedDocument.header.id) {
            console.error("No selected document");
            return;
          }

          if (!remoteUrl) {
            console.error("No remote drive url found");
            return;
          }

          // @todo: add environment variable for token expiration
          const token = user?.address
            ? await renown?.getBearerToken({
                expiresIn: 600,
                aud: remoteUrl,
              })
            : undefined;

          const url = buildDocumentSubgraphUrl(
            remoteUrl,
            selectedDocument.header.id,
            token,
          );
          try {
            openUrl(url);
          } catch (e) {
            console.error("Error opening switchboard link", e);
          }
        }
      : undefined;
  }, [isRemoteDrive, remoteUrl, selectedDocument]);

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
