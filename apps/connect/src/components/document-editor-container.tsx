import { openUrl } from "@powerhousedao/connect";
import {
  buildDocumentSubgraphUrl,
  exportFile,
  setSelectedNode,
  useDocumentModelModuleById,
  useDriveIsRemote,
  useDriveRemoteUrl,
  useParentFolder,
  useSelectedDocument,
  useSelectedDrive,
} from "@powerhousedao/reactor-browser";
import { type PHDocument } from "document-model";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useModal } from "../components/modal/index.js";
import { validateDocument } from "../utils/validate-document.js";
import { DocumentEditor } from "./editors.js";

export function DocumentEditorContainer() {
  const { t } = useTranslation();
  const { showModal } = useModal();
  const [selectedDrive] = useSelectedDrive();
  const [selectedDocument] = useSelectedDocument();
  const parentFolder = useParentFolder(selectedDocument?.header.id);
  const documentType = selectedDocument?.header.documentType;
  const isRemoteDrive = useDriveIsRemote(selectedDrive?.header.id);
  const remoteUrl = useDriveRemoteUrl(selectedDrive?.header.id);
  const documentModelModule = useDocumentModelModuleById(documentType);

  const exportDocument = (document: PHDocument) => {
    const validationErrors = validateDocument(document);

    if (validationErrors.length) {
      showModal("confirmationModal", {
        title: t("modals.exportDocumentWithErrors.title"),
        body: (
          <div>
            <p>{t("modals.exportDocumentWithErrors.body")}</p>
            <ul className="mt-4 flex list-disc flex-col items-start px-4 text-xs">
              {validationErrors.map((error, index) => (
                <li key={index}>{error.message}</li>
              ))}
            </ul>
          </div>
        ),
        cancelLabel: t("common.cancel"),
        continueLabel: t("common.export"),
        onCancel(closeModal) {
          closeModal();
        },
        onContinue(closeModal) {
          closeModal();
          return exportFile(document);
        },
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

          if (!documentModelModule) {
            console.error("No document model found");
            return;
          }

          const url = buildDocumentSubgraphUrl(
            remoteUrl,
            selectedDocument.header.id,
            documentModelModule.documentModel,
          );
          try {
            openUrl(url);
          } catch (e) {
            console.error("Error opening switchboard link", e);
          }
        }
      : undefined;
  }, [isRemoteDrive, remoteUrl, selectedDocument, documentModelModule]);

  if (!selectedDocument) return null;

  return (
    <div className="flex-1 rounded-2xl bg-gray-50 p-4">
      <DocumentEditor
        document={selectedDocument}
        onClose={() => setSelectedNode(parentFolder)}
        onExport={onExport}
        onOpenSwitchboardLink={onOpenSwitchboardLink}
      />
    </div>
  );
}
