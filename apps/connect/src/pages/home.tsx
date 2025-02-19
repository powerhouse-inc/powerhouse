import {
    HomeScreen,
    HomeScreenAddDriveItem,
    HomeScreenItem,
    Icon,
    UiDriveNode,
} from '@powerhousedao/design-system';
import { useCallback } from 'react';
import { useUiNodes } from 'src/hooks/useUiNodes';

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
    const { showAddDriveModal, driveNodes, setSelectedNode } = useUiNodes();

    const handleDriveClick = useCallback(
        (driveNode: UiDriveNode) => {
            setSelectedNode(driveNode);
        },
        [setSelectedNode],
    );

    const onAddDriveClick = useCallback(() => {
        showAddDriveModal('PUBLIC');
    }, [showAddDriveModal]);

    return (
        <HomeScreen>
            {driveNodes.map(driveNode => (
                <HomeScreenItem
                    key={driveNode.id}
                    title={driveNode.name}
                    description="Drive Explorer App"
                    icon={getDriveIcon(driveNode)}
                    onClick={() => handleDriveClick(driveNode)}
                />
            ))}
            <HomeScreenAddDriveItem onClick={onAddDriveClick} />
        </HomeScreen>
    );
}
