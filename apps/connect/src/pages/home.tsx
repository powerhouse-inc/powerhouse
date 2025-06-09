import {
    useConnectConfig,
    useDocumentDriveServer,
    useShowAddDriveModal,
} from '#hooks';
import { useGetAppNameForEditorId } from '#store';
import {
    getDriveSharingType,
    useSetSelectedNodeId,
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
    const showAddDriveModal = useShowAddDriveModal();
    const { documentDrives } = useDocumentDriveServer();
    const setSelectedNodeId = useSetSelectedNodeId();
    const [config] = useConnectConfig();
    const handleDriveClick = useCallback(
        (driveId: string) => {
            setSelectedNodeId(driveId);
        },
        [setSelectedNodeId],
    );

    const onAddDriveClick = useCallback(() => {
        showAddDriveModal();
    }, [showAddDriveModal]);

    return (
        <HomeScreen>
            {documentDrives.map(drive => {
                const editorId = drive?.meta?.preferredEditor;
                const appName = editorId
                    ? getAppDescriptionForEditorId(editorId)
                    : undefined;
                return (
                    <HomeScreenItem
                        key={drive.id}
                        title={drive.name}
                        description={appName || 'Drive Explorer App'}
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
