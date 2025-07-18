import {
    useConnectConfig,
    useDocumentDriveServer,
    useShowAddDriveModal,
} from '#hooks';
import { useGetAppNameForEditorId } from '#store';
import {
    HomeScreen,
    HomeScreenAddDriveItem,
    HomeScreenItem,
    Icon,
    type UiDriveNode,
} from '@powerhousedao/design-system';
import { useUiNodesContext } from '@powerhousedao/reactor-browser';
import { useCallback } from 'react';

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
    const showAddDriveModal = useShowAddDriveModal();
    const { documentDrives } = useDocumentDriveServer();
    const { driveNodes, setSelectedNode } = useUiNodesContext();
    const [config] = useConnectConfig();
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
                    d => d.header.id === driveNode.id,
                );
                const editorId = drive?.header.meta?.preferredEditor;
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
            {config.drives.addDriveEnabled && (
                <HomeScreenAddDriveItem onClick={onAddDriveClick} />
            )}
        </HomeScreen>
    );
}
