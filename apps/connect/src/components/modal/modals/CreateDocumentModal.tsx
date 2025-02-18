import {
    CreateDocumentModal as ConnectCreateDocumentModal,
    FILE,
    TDocumentType,
    UiDriveNode,
    UiFolderNode,
    UiNode,
} from '@powerhousedao/design-system';
import { DocumentModel } from 'document-model';
import { useDocumentDriveServer } from 'src/hooks/useDocumentDriveServer';
import { makeNodeSlugFromNodeName } from 'src/utils/slug';

export interface CreateDocumentModalProps {
    open: boolean;
    selectedParentNode: UiDriveNode | UiFolderNode | null;
    setSelectedNode: (uiNode: UiNode | null) => void;
    documentModel: DocumentModel;
    onClose: () => void;
}

export const CreateDocumentModal: React.FC<
    CreateDocumentModalProps
> = props => {
    const {
        open,
        onClose,
        selectedParentNode,
        setSelectedNode,
        documentModel,
    } = props;

    const { addDocument } = useDocumentDriveServer();

    const onCreateDocument = async (documentName: string) => {
        onClose();

        if (!selectedParentNode) {
            throw new Error('No drive or folder selected');
        }

        const node = await addDocument(
            selectedParentNode.driveId,
            documentName || `New ${documentModel.documentModel.name}`,
            documentModel.documentModel.id,
            selectedParentNode.id,
        );

        if (node) {
            setSelectedNode({
                ...node,
                slug: makeNodeSlugFromNodeName(node.name),
                kind: FILE,
                documentType: node.documentType as TDocumentType,
                parentFolder: selectedParentNode.id,
                driveId: selectedParentNode.driveId,
                syncStatus: selectedParentNode.syncStatus,
                synchronizationUnits: [],
                sharingType: selectedParentNode.sharingType,
            });
        }
    };

    return (
        <ConnectCreateDocumentModal
            open={open}
            onContinue={onCreateDocument}
            onOpenChange={status => {
                if (!status) return onClose();
            }}
        />
    );
};
