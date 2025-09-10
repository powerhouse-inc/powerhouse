import { CreateDocumentModal as ConnectCreateDocumentModal } from "@powerhousedao/design-system";
import {
  addDocument,
  setSelectedNode,
  useSelectedDrive,
  useSelectedFolder,
  useSelectedParentFolder,
} from "@powerhousedao/reactor-browser";
import type { DocumentModelModule } from "document-model";

export interface CreateDocumentModalProps {
  open: boolean;
  documentModel: DocumentModelModule;
  onClose: () => void;
}

export const CreateDocumentModal: React.FC<CreateDocumentModalProps> = (
  props,
) => {
  const { open, documentModel, onClose } = props;
  const [selectedDrive] = useSelectedDrive();
  const selectedFolder = useSelectedFolder();
  const parentFolder = useSelectedParentFolder();

  const onCreateDocument = async (documentName: string) => {
    onClose();
    if (!selectedDrive) return;

    const node = await addDocument(
      selectedDrive.header.id,
      documentName || `New ${documentModel.documentModel.name}`,
      documentModel.documentModel.id,
      selectedFolder?.id ?? parentFolder?.id,
    );
    setSelectedNode(node);
  };

  return (
    <ConnectCreateDocumentModal
      open={open}
      onContinue={onCreateDocument}
      onOpenChange={(status: boolean) => {
        if (!status) return onClose();
      }}
    />
  );
};
