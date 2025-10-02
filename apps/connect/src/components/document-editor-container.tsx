import { openUrl } from "#utils";
import {
  exportFile,
  setSelectedNode,
  showPHModal,
  useConnectCrypto,
  useDriveIsRemote,
  useDriveRemoteUrl,
  useParentFolder,
  useSelectedDocument,
  useSelectedDrive,
  useUser,
} from "@powerhousedao/reactor-browser";
import { buildDocumentSubgraphUrl } from "@powerhousedao/reactor-browser/utils/switchboard";
import type { PHDocument } from "document-model";
import { useMemo } from "react";
import { validateDocument } from "../utils/validate-document.js";
import { DocumentEditor } from "./editors.js";

export function DocumentEditorContainer() {
  const [selectedDrive] = useSelectedDrive();
  const [selectedDocument] = useSelectedDocument();
  const parentFolder = useParentFolder(selectedDocument?.header.id);
  const isRemoteDrive = useDriveIsRemote(selectedDrive?.header.id);
  const remoteUrl = useDriveRemoteUrl(selectedDrive?.header.id);
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
