import { useDocumentDriveServer } from '#hooks';
import { useModal, useUnwrappedDriveById } from '@powerhousedao/common';
import { ConnectDeleteDriveModal } from '@powerhousedao/design-system';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

export const DeleteDriveModal: React.FC = () => {
    const { isOpen, props, hide } = useModal('deleteDrive');
    const { driveId } = props;
    const drive = useUnwrappedDriveById(driveId);

    const { t } = useTranslation();
    const { deleteDrive } = useDocumentDriveServer();

    const onDelete = useCallback(async () => {
        if (!driveId) return;
        await deleteDrive(driveId);
        hide();
    }, [deleteDrive, driveId]);

    if (!isOpen || !drive) return null;

    const name = drive.name;

    return (
        <ConnectDeleteDriveModal
            open={isOpen}
            driveName={name}
            onCancel={hide}
            header={t('modals.deleteDrive.title', { label: name })}
            body={t('modals.deleteDrive.body')}
            inputPlaceholder={t('modals.deleteDrive.inputPlaceholder')}
            cancelLabel={t('common.cancel')}
            continueLabel={t('common.delete')}
            onContinue={onDelete}
            onOpenChange={(status: boolean) => {
                if (!status) return hide();
            }}
        />
    );
};
