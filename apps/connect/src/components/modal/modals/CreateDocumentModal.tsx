import { useDocumentDriveServer } from '#hooks/useDocumentDriveServer';
import { makeNodeSlugFromNodeName } from '#utils/slug';
import {
    CreateDocumentModal as ConnectCreateDocumentModal,
    FILE,
    TDocumentType,
    UiDriveNode,
    UiFolderNode,
    UiNode,
} from '@powerhousedao/design-system';
import { DocumentModelModule } from 'document-model';

export interface CreateDocumentModalProps {
    open: boolean;
    selectedParentNode: UiDriveNode | UiFolderNode | null;
    setSelectedNode: (uiNode: UiNode | null) => void;
    documentModel: DocumentModelModule;
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
            documentName || `New ${documentModel.documentModelState.name}`,
            documentModel.documentModelState.id,
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
