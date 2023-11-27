import { ConnectDeleteItemModal } from '@powerhousedao/design-system';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDocumentDriveServer } from 'src/hooks/useDocumentDriveServer';

export interface DeleteItemModalProps {
    open: boolean;
    itemId: string;
    driveId: string;
    itemName: string;
    onClose: () => void;
}

export const DeleteItemModal: React.FC<DeleteItemModalProps> = props => {
    const { open, onClose, itemId, driveId, itemName } = props;

    const { t } = useTranslation();
    const { deleteNode } = useDocumentDriveServer();

    const onDelete = () => {
        deleteNode(driveId, itemId);
        onClose();
    };

    return (
        <ConnectDeleteItemModal
            open={open}
            onClose={onClose}
            onDelete={onDelete}
            header={t('modals.deleteItem.header', { item: itemName })}
            body={t('modals.deleteItem.body')}
            cancelLabel={t('common.cancel')}
            deleteLabel={t('common.delete')}
        />
    );
};
