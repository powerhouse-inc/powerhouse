import {
    HomeScreen,
    HomeScreenAddDriveItem,
    HomeScreenItem,
    Icon,
    UiDriveNode,
} from '@powerhousedao/design-system';
import { useCallback } from 'react';
import { useDocumentDriveServer } from 'src/hooks/useDocumentDriveServer';
import { useUiNodes } from 'src/hooks/useUiNodes';
import { useGetAppNameForEditorId } from 'src/store/external-packages';

function getDriveIcon(driveNode: UiDriveNode) {
    if (driveNode.icon) {
        return (
            <img
                src={driveNode.icon}
                alt={driveNode.name}
                height={32}
                width={32}
            />
        );
    }
    if (driveNode.sharingType === 'LOCAL') {
        return <Icon name="Hdd" size={32} />;
    } else {
        return <Icon name="Server" size={32} />;
    }
}

export function Home() {
    const getAppDescriptionForEditorId = useGetAppNameForEditorId();
    const { showAddDriveModal, driveNodes, setSelectedNode } = useUiNodes();
    const { documentDrives } = useDocumentDriveServer();

    const handleDriveClick = useCallback(
        (driveNode: UiDriveNode) => {
            setSelectedNode(driveNode);
        },
        [setSelectedNode],
    );

    const onAddDriveClick = useCallback(() => {
        showAddDriveModal();
    }, [showAddDriveModal]);

    return (
        <HomeScreen>
            {driveNodes.map(driveNode => {
                const drive = documentDrives.find(
                    d => d.state.global.id === driveNode.id,
                );
                const editorId = drive?.meta?.preferredEditor;
                const appName = editorId
                    ? getAppDescriptionForEditorId(editorId)
                    : undefined;
                return (
                    <HomeScreenItem
                        key={driveNode.id}
                        title={driveNode.name}
                        description={appName || 'Drive Explorer App'}
                        icon={getDriveIcon(driveNode)}
                        onClick={() => handleDriveClick(driveNode)}
                    />
                );
            })}
            <HomeScreenAddDriveItem onClick={onAddDriveClick} />
        </HomeScreen>
    );
}
