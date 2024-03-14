import { ConnectDeleteItemModal, toast } from '@powerhousedao/design-system';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDocumentDriveServer } from 'src/hooks/useDocumentDriveServer';

export interface DeleteItemModalProps {
    open: boolean;
    itemId: string;
    driveId: string;
    itemName: string;
    onClose: () => void;
    type: 'file' | 'folder';
}

export const DeleteItemModal: React.FC<DeleteItemModalProps> = props => {
    const { open, onClose, itemId, driveId, itemName, type } = props;

    const { t } = useTranslation();
    const { deleteNode } = useDocumentDriveServer();

    const onDelete = async () => {
        const i18nKey =
            type === 'folder'
                ? 'notifications.deleteFolderSuccess'
                : 'notifications.fileDeleteSuccess';

        await deleteNode(driveId, itemId);

        toast(t(i18nKey), { type: 'connect-deleted' });
        onClose();
    };

    return (
        <ConnectDeleteItemModal
            open={open}
            onDelete={onDelete}
            onCancel={() => onClose()}
            header={t(`modals.deleteItem.${type}.header`, { item: itemName })}
            body={t(`modals.deleteItem.${type}.body`)}
            cancelLabel={t('common.cancel')}
            deleteLabel={t('common.delete')}
        />
    );
};
