import {
    ConnectSidebar,
    Icon,
    SidebarAddDriveItem,
    SidebarItem,
    UiDriveNode,
} from '@powerhousedao/design-system';
import { logger } from 'document-drive/logger';
import { useAtom } from 'jotai';
import { useCallback } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { useNavigate } from 'react-router-dom';
import { useLogin } from 'src/hooks/useLogin';
import { useUiNodes } from 'src/hooks/useUiNodes';
import { sidebarCollapsedAtom } from 'src/store';
import { useModal } from './modal';

export default function Sidebar() {
    const [collapsed, setCollapsed] = useAtom(sidebarCollapsedAtom);
    const { showModal } = useModal();
    const navigate = useNavigate();

    const { user, openRenown } = useLogin();
    const { driveNodes, setSelectedNode, selectedNode, showAddDriveModal } =
        useUiNodes();

    const connectDebug = localStorage.getItem('CONNECT_DEBUG') === 'true';

    const onClickSettings = () => {
        showModal('settingsModal', { onRefresh: () => navigate(0) });
    };

    const onRootClick = useCallback(() => {
        setSelectedNode(null);
        navigate('/');
    }, [navigate, setSelectedNode]);

    const onAddDriveClick = useCallback(() => {
        showAddDriveModal('PUBLIC');
    }, [showAddDriveModal]);

    const headerContent = (
        <div className="flex h-full items-center">
            <Icon
                name="Connect"
                className="!h-[30px] !w-[100px] cursor-pointer"
                onClick={onRootClick}
            />
            {connectDebug && (
                <button
                    id="connect-debug-button"
                    className="ml-6"
                    onClick={() => showModal('debugSettingsModal', {})}
                >
                    <img src="settings.png" className="h-5 text-gray-600" />
                </button>
            )}
        </div>
    );

    const handleDriveClick = useCallback(
        (driveNode: UiDriveNode) => {
            setSelectedNode(driveNode);
        },
        [setSelectedNode],
    );
    return (
        <ConnectSidebar
            id="sidebar"
            onClick={() => onRootClick()}
            onClickSettings={onClickSettings}
            headerContent={headerContent}
            address={user?.address}
            onLogin={openRenown}
        >
            <ErrorBoundary
                fallback={
                    <div className="text-center">
                        There was an error loading drives
                    </div>
                }
                onError={logger.error}
            >
                {driveNodes.map((node, index) => (
                    <SidebarItem
                        key={index}
                        title={node.name}
                        onClick={() => handleDriveClick(node)}
                        active={selectedNode?.id === node.id}
                        icon={
                            node.icon ? (
                                <img
                                    src={node.icon}
                                    alt={node.name}
                                    width={32}
                                    height={32}
                                />
                            ) : undefined
                        }
                    />
                ))}
                <SidebarAddDriveItem onClick={onAddDriveClick} />
            </ErrorBoundary>
        </ConnectSidebar>
    );
}
