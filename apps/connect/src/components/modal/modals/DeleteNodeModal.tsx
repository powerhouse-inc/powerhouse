import { useDocumentDriveServer } from '#hooks';
import {
    useModal,
    useNodeKind,
    useUnwrappedSelectedDrive,
    useUnwrappedDocumentById,
} from '@powerhousedao/common';
import { ConnectDeleteItemModal } from '@powerhousedao/design-system';
import type React from 'react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

export const DeleteNodeModal: React.FC = () => {
    const { t } = useTranslation();
    const { isOpen, props, hide } = useModal('deleteNode');
    const { nodeId } = props;
    const drive = useUnwrappedSelectedDrive();
    const nodeKind = useNodeKind(nodeId);
    const document = useUnwrappedDocumentById(nodeId);
    const nodeName = document?.name;
    const { deleteNode } = useDocumentDriveServer();

    const onDelete = useCallback(async () => {
        if (!drive?.id || !nodeId) return;
        await deleteNode(drive.id, nodeId);
        hide();
    }, [deleteNode, drive?.id, nodeId]);

    if (!isOpen || !nodeKind || !nodeName) return null;

    return (
        <ConnectDeleteItemModal
            open={isOpen}
            onDelete={onDelete}
            onCancel={hide}
            header={t(`modals.deleteItem.${nodeKind.toLowerCase()}.header`, {
                item: nodeName,
            })}
            body={t(`modals.deleteItem.${nodeKind.toLowerCase()}.body`)}
            cancelLabel={t('common.cancel')}
            deleteLabel={t('common.delete')}
        />
    );
};
