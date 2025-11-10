import { DocumentEditor } from "@powerhousedao/connect/components";
import { openUrl } from "@powerhousedao/connect/utils/openUrl";
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
import {
  useConnectCrypto,
  useUser,
} from "@powerhousedao/reactor-browser/connect";
import type { PHDocument } from "document-model";
import { useMemo } from "react";

export function DocumentEditorContainer() {
  const [selectedDrive] = useSelectedDrive();
  const [selectedDocument] = useSelectedDocument();
  const parentFolder = useNodeParentFolderById(selectedDocument?.header.id);
  const isRemoteDrive = getDriveIsRemote(selectedDrive);
  const remoteUrl = getDriveRemoteUrl(selectedDrive);
  const connectCrypto = useConnectCrypto();
  const user = useUser();

  const exportDocument = (document: PHDocument) => {
    const validationErrors = validateDocument(document);

    if (validationErrors.length) {
      showPHModal({
        type: "exportDocumentWithErrors",
        documentId: document.header.id,
      });
    } else {
      return exportFile(document);
    }
  };

  const onExport = () => {
    if (selectedDocument) {
      return exportDocument(selectedDocument);
    }
  };

  // TODO: fix this mess
  const onOpenSwitchboardLink = useMemo(() => {
    return isRemoteDrive
      ? async () => {
          if (!selectedDocument?.header.id) {
            console.error("No selected document");
            return;
          }

          if (!remoteUrl) {
            console.error("No remote drive url found");
            return;
          }

          // @todo: add environment variable for token expiration
          const token = user?.address
            ? await connectCrypto?.getBearerToken(
                remoteUrl,
                user.address,
                false,
                { expiresIn: 600 },
              )
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

  if (!selectedDocument) return null;

  return (
    <div
      id="document-editor-container"
      className="flex-1 rounded-2xl bg-gray-50 p-4"
    >
      <DocumentEditor
        document={selectedDocument}
        onClose={() => setSelectedNode(parentFolder)}
        onExport={onExport}
        onOpenSwitchboardLink={onOpenSwitchboardLink}
      />
    </div>
  );
}
