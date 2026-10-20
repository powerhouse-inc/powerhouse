import { CreateDocumentModal as ConnectCreateDocumentModal } from "@powerhousedao/design-system/connect";
import {
  addDocument,
  closePHModal,
  setSelectedNode,
  useDocumentModelModuleById,
  useNodeParentFolderById,
  usePHModal,
} from "@powerhousedao/reactor-browser";
import { useDriveRouteData } from "@powerhousedao/connect-core/router";

export const CreateDocumentModal: React.FC = () => {
  const phModal = usePHModal();
  const open = phModal?.type === "createDocument";
  const documentType = open ? phModal.documentType : undefined;
  const documentModelVersion = open ? phModal.documentModelVersion : undefined;
  const documentModel = useDocumentModelModuleById(
    documentType,
    documentModelVersion,
  );
  // In the open folder, else beside the open document.
  const { drive, folder, documentId } = useDriveRouteData();
  const parentFolder = useNodeParentFolderById(documentId);

  const onCreateDocument = async (documentName: string) => {
    closePHModal();
    if (!drive || !documentModel) return;

    const node = await addDocument(
      drive.header.id,
      documentName || `New ${documentModel.documentModel.global.name}`,
      documentModel.documentModel.global.id,
      folder?.id ?? parentFolder?.id,
      undefined,
      undefined,
      undefined,
      documentModelVersion,
    );
    setSelectedNode(node);
  };

  return (
    <ConnectCreateDocumentModal
      open={open}
      onContinue={(documentName) => {
        void onCreateDocument(documentName);
      }}
      onOpenChange={(status: boolean) => {
        if (!status) return closePHModal();
      }}
    />
  );
};
