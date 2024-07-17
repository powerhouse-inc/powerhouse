import {
    ConnectDeleteDriveModal,
    UiDriveNode,
} from '@powerhousedao/design-system';
import React from 'react';
import { useTranslation } from 'react-i18next';

export interface DeleteDriveModalProps {
    uiDriveNode: UiDriveNode;
    open: boolean;
    onClose: () => void;
    onDelete: (closeModal: () => void) => void;
    onCancel: (closeModal: () => void) => void;

}

export const DeleteDriveModal: React.FC<DeleteDriveModalProps> = props => {
    const { open, onClose, onCancel, uiDriveNode, onDelete } = props;

    const { t } = useTranslation();

    return (
        <ConnectDeleteDriveModal
            open={open}
            driveName={uiDriveNode.name}
            onCancel={() => onCancel(onClose)}
            header={t('modals.deleteDrive.title', { label: uiDriveNode.name })}
            body={t('modals.deleteDrive.body')}
            inputPlaceholder={t('modals.deleteDrive.inputPlaceholder')}
            cancelLabel={t('common.cancel')}
            continueLabel={t('common.delete')}
            onContinue={() => onDelete(onClose)}
            onOpenChange={status => {
                if (!status) return onClose();
            }}
        />
    );
};
