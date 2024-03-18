import { ConnectDeleteDriveModal } from '@powerhousedao/design-system';
import React from 'react';
import { useTranslation } from 'react-i18next';

export interface DeleteDriveModalProps {
    open: boolean;
    onClose: () => void;
    onDelete: (closeModal: () => void) => void;
    onCancel: (closeModal: () => void) => void;

    driveName: string;
}

export const DeleteDriveModal: React.FC<DeleteDriveModalProps> = props => {
    const { open, onClose, onCancel, driveName, onDelete } = props;

    const { t } = useTranslation();

    return (
        <ConnectDeleteDriveModal
            open={open}
            driveName={driveName}
            onCancel={() => onCancel(onClose)}
            header={t('modals.deleteDrive.title', { label: driveName })}
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
