import { useDocumentDriveServer } from '#hooks';
import {
    useModal,
    useSetSelectedNode,
    useUnwrappedSelectedDrive,
    useUnwrappedSelectedFolder,
} from '@powerhousedao/common';
import { CreateDocumentModal as ConnectCreateDocumentModal } from '@powerhousedao/design-system';
import { useCallback } from 'react';

export const CreateDocumentModal: React.FC = () => {
    const { isOpen, props, hide } = useModal('addDocument');
    const { documentModelId } = props;

    const { addDocument } = useDocumentDriveServer();
    const selectedDrive = useUnwrappedSelectedDrive();
    const selectedFolder = useUnwrappedSelectedFolder();
    const setSelectedNode = useSetSelectedNode();
    const onCreateDocument = useCallback(
        async (name: string) => {
            if (!selectedDrive?.id) return;

            const node = await addDocument(
                selectedDrive.id,
                name,
                documentModelId,
                selectedFolder?.id,
            );

            if (node) {
                setSelectedNode(node.id);
            }
            hide();
        },
        [
            addDocument,
            selectedDrive?.id,
            selectedFolder?.id,
            hide,
            documentModelId,
        ],
    );

    if (!isOpen || !documentModelId) return null;

    return (
        <ConnectCreateDocumentModal
            open={isOpen}
            onContinue={onCreateDocument}
            onOpenChange={(status: boolean) => {
                if (!status) return hide();
            }}
        />
    );
};
