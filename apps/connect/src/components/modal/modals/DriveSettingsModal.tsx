import { useDocumentDriveServer } from '#hooks';
import {
    getDriveAvailableOffline,
    getDriveSharingType,
    useModal,
    useUnwrappedDriveById,
} from '@powerhousedao/common';
import {
    DriveSettingsModal as ConnectDriveSettingsModal,
    type SharingType,
} from '@powerhousedao/design-system';
import { t } from 'i18next';
import { useCallback } from 'react';

export function DriveSettingsModal() {
    const { isOpen, props, hide } = useModal('driveSettings');
    const { show: showDeleteDriveModal } = useModal('deleteDrive');
    const { driveId } = props;
    const drive = useUnwrappedDriveById(driveId);
    const name = drive?.name;
    const sharingType = getDriveSharingType(drive);
    const availableOffline = getDriveAvailableOffline(drive);
    const {
        renameDrive,
        setDriveAvailableOffline,
        setDriveSharingType,
        deleteDrive,
    } = useDocumentDriveServer();
    const onRenameDrive = useCallback(
        async (newName: string) => {
            if (!driveId) return;
            await renameDrive(driveId, newName);
        },
        [renameDrive],
    );

    const onChangeSharingType = useCallback(
        async (driveId: string, newSharingType: SharingType) => {
            await setDriveSharingType(driveId, newSharingType);
        },
        [setDriveSharingType],
    );

    const onChangeAvailableOffline = useCallback(
        async (driveId: string, newAvailableOffline: boolean) => {
            await setDriveAvailableOffline(driveId, newAvailableOffline);
        },
        [setDriveAvailableOffline],
    );
    const onDeleteDrive = useCallback(() => {
        if (!driveId) return;
        showDeleteDriveModal({ driveId });
    }, [deleteDrive, showDeleteDriveModal, t]);

    if (!isOpen || !driveId || !name) return null;

    return (
        <ConnectDriveSettingsModal
            driveId={driveId}
            open={isOpen}
            name={name}
            sharingType={sharingType}
            availableOffline={availableOffline ?? false}
            onRenameDrive={onRenameDrive}
            onDeleteDrive={onDeleteDrive}
            onChangeAvailableOffline={onChangeAvailableOffline}
            onChangeSharingType={onChangeSharingType}
            onOpenChange={status => {
                if (!status) return hide();
            }}
            closeModal={hide}
        />
    );
}
