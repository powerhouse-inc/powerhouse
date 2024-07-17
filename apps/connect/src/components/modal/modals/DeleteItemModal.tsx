import {
    ConnectDeleteItemModal,
    FILE,
    FOLDER,
    toast,
} from '@powerhousedao/design-system';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDocumentDriveServer } from 'src/hooks/useDocumentDriveServer';

export interface DeleteItemModalProps {
    open: boolean;
    id: string;
    driveId: string;
    name: string;
    onClose: () => void;
    kind: typeof FILE | typeof FOLDER;
}

export const DeleteItemModal: React.FC<DeleteItemModalProps> = props => {
    const { open, onClose, id, driveId, name, kind } = props;

    const { t } = useTranslation();
    const { deleteNode } = useDocumentDriveServer();

    const onDelete = async () => {
        const i18nKey =
            kind === FOLDER
                ? 'notifications.deleteFolderSuccess'
                : 'notifications.fileDeleteSuccess';

        await deleteNode(driveId, id);

        toast(t(i18nKey), { type: 'connect-deleted' });
        onClose();
    };

    return (
        <ConnectDeleteItemModal
            open={open}
            onDelete={onDelete}
            onCancel={() => onClose()}
            header={t(`modals.deleteItem.${kind.toLowerCase()}.header`, {
                item: name,
            })}
            body={t(`modals.deleteItem.${kind.toLowerCase()}.body`)}
            cancelLabel={t('common.cancel')}
            deleteLabel={t('common.delete')}
        />
    );
};
