import { CreateDocumentModal as ConnectCreateDocumentModal } from "@powerhousedao/design-system/connect/components/modal/create-document-modal";
import {
  addDocument,
  closePHModal,
  setSelectedNode,
  useDocumentModelModuleById,
  useParentFolderForSelectedNode,
  usePHModal,
  useSelectedDriveSafe,
  useSelectedFolder,
} from "@powerhousedao/reactor-browser";

export const CreateDocumentModal: React.FC = () => {
  const phModal = usePHModal();
  const open = phModal?.type === "createDocument";
  const documentType = open ? phModal.documentType : undefined;
  const documentModel = useDocumentModelModuleById(documentType);
  const [selectedDrive] = useSelectedDriveSafe();
  const selectedFolder = useSelectedFolder();
  const parentFolder = useParentFolderForSelectedNode();

  const onCreateDocument = async (documentName: string) => {
    closePHModal();
    if (!selectedDrive || !documentModel) return;

    const node = await addDocument(
      selectedDrive.header.id,
      documentName || `New ${documentModel.documentModel.global.name}`,
      documentModel.documentModel.global.id,
      selectedFolder?.id ?? parentFolder?.id,
    );
    setSelectedNode(node);
  };

  return (
    <ConnectCreateDocumentModal
      open={open}
      onContinue={onCreateDocument}
      onOpenChange={(status: boolean) => {
        if (!status) return closePHModal();
      }}
    />
  );
};
