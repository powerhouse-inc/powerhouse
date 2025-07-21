import { useDocumentDriveServer } from '#hooks';
import { CreateDocumentModal as ConnectCreateDocumentModal } from '@powerhousedao/design-system';
import { type DocumentDriveDocument, type FolderNode } from 'document-drive';
import { type DocumentModelModule } from 'document-model';

export interface CreateDocumentModalProps {
    open: boolean;
    selectedDrive: DocumentDriveDocument | null | undefined;
    selectedFolder: FolderNode | null | undefined;
    parentFolder: FolderNode | null | undefined;
    documentModel: DocumentModelModule;
    setSelectedNode: (id: string | undefined) => void;
    onClose: () => void;
}

export const CreateDocumentModal: React.FC<
    CreateDocumentModalProps
> = props => {
    const {
        open,
        documentModel,
        selectedDrive,
        selectedFolder,
        parentFolder,
        onClose,
        setSelectedNode,
    } = props;

    const { addDocument } = useDocumentDriveServer();

    const onCreateDocument = async (documentName: string) => {
        onClose();
        if (!selectedDrive) return;

        const node = await addDocument(
            selectedDrive.header.id,
            documentName || `New ${documentModel.documentModel.name}`,
            documentModel.documentModel.id,
            selectedFolder?.id ?? parentFolder?.id,
        );

        if (node) {
            setSelectedNode(node.id);
        }
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
