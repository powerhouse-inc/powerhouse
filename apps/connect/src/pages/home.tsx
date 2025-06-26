import {
    getDriveSharingType,
    useConfig,
    useDrives,
    useGetAppNameForEditorId,
    useModal,
    useSetSelectedDrive,
    useSetSelectedNode,
} from '@powerhousedao/common';
import {
    HomeScreen,
    HomeScreenAddDriveItem,
    HomeScreenItem,
    Icon,
} from '@powerhousedao/design-system';

import { type DocumentDriveDocument } from 'document-drive';
import { useCallback } from 'react';

function getDriveIcon(drive: DocumentDriveDocument) {
    const iconSrc = drive.state.global.icon;
    const sharingType = getDriveSharingType(drive);
    if (iconSrc) {
        return <img src={iconSrc} alt={drive.name} height={32} width={32} />;
    }
    if (sharingType === 'LOCAL') {
        return <Icon name="Hdd" size={32} />;
    } else {
        return <Icon name="Server" size={32} />;
    }
}

export function Home() {
    const getAppDescriptionForEditorId = useGetAppNameForEditorId();
    const { show: showAddDriveModal } = useModal('addDrive');
    const loadableDrives = useDrives();
    const setSelectedDrive = useSetSelectedDrive();
    const config = useConfig();
    const handleDriveClick = useCallback(
        (driveId: string) => {
            setSelectedDrive(driveId);
        },
        [setSelectedDrive],
    );

    const onAddDriveClick = useCallback(() => {
        showAddDriveModal();
    }, [showAddDriveModal]);

    if (loadableDrives.state !== 'hasData') {
        return 'Loading...';
    }
    const documentDrives = loadableDrives.data ?? [];

    return (
        <HomeScreen>
            {documentDrives.map(drive => {
                return (
                    <HomeScreenItem
                        key={drive.id}
                        title={drive.name}
                        description={'Drive Explorer App'}
                        icon={getDriveIcon(drive)}
                        onClick={() => handleDriveClick(drive.id)}
                    />
                );
            })}
            {config.drives.addDriveEnabled && (
                <HomeScreenAddDriveItem onClick={onAddDriveClick} />
            )}
        </HomeScreen>
    );
}
