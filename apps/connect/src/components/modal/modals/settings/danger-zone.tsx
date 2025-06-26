import { useDocumentDriveServer } from '#hooks';
import {
    unwrapLoadable,
    useDrives,
    useDriveSharingType,
    useModal,
} from '@powerhousedao/common';
import { DangerZone as BaseDangerZone } from '@powerhousedao/design-system';
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

function useUnwrappedDriveSharingType(driveId: string | null) {
    const loadableSharingType = useDriveSharingType(driveId);
    return unwrapLoadable(loadableSharingType)!;
}

export const DangerZone: React.FC = () => {
    const { deleteDrive } = useDocumentDriveServer();
    const loadableDrives = useDrives();
    const { show: showClearStorageModal } = useModal('clearStorage');
    const navigate = useNavigate();

    const handleDeleteDrive = useCallback(
        async (driveId: string) => {
            navigate('/');
            await deleteDrive(driveId);
        },
        [deleteDrive, navigate],
    );

    const handleClearStorage = useCallback(() => {
        showClearStorageModal();
    }, [showClearStorageModal]);

    if (loadableDrives.state !== 'hasData') {
        return null;
    }
    const documentDrives = loadableDrives.data ?? [];

    return (
        <BaseDangerZone
            drives={documentDrives}
            onDeleteDrive={handleDeleteDrive}
            onClearStorage={handleClearStorage}
            useDriveSharingType={useUnwrappedDriveSharingType}
        />
    );
};
