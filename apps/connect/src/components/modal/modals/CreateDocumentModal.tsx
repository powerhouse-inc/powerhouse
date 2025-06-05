import { useDocumentDriveServer } from '#hooks';
import { CreateDocumentModal as ConnectCreateDocumentModal } from '@powerhousedao/design-system';
import { useSetSelectedNodeId } from '@powerhousedao/reactor-browser';
import { type DocumentModelModule, type PHDocument } from 'document-model';

export interface CreateDocumentModalProps {
    open: boolean;
    documentModel: DocumentModelModule;
    onClose: () => void;
}

export const CreateDocumentModal: React.FC<
    CreateDocumentModalProps
> = props => {
    const { open, onClose, documentModel } = props;
    const { addDocument } = useDocumentDriveServer();
    const setSelectedNodeId = useSetSelectedNodeId();
    const onCreateDocument = async (
        driveId: string,
        name: string,
        parentFolder?: string,
        document?: PHDocument,
    ) => {
        onClose();

        const node = await addDocument(
            driveId,
            name,
            documentModel.documentModel.id,
            parentFolder,
            document,
        );

        if (node) {
            setSelectedNodeId(node.id);
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
