import { useConnectConfig, useLogin, useShowAddDriveModal } from '#hooks';
import {
    ConnectSidebar,
    Icon,
    SidebarAddDriveItem,
    SidebarItem,
    type UiDriveNode,
} from '@powerhousedao/design-system';
import { useUiNodesContext } from '@powerhousedao/reactor-browser';
import { logger } from 'document-drive';
import { useCallback } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { useNavigate } from 'react-router-dom';
import { useModal } from './modal/index.js';

export default function Sidebar() {
    const { showModal } = useModal();
    const navigate = useNavigate();

    const { user, openRenown, logout } = useLogin();
    const { driveNodes, setSelectedNode, selectedNode } = useUiNodesContext();
    const [config] = useConnectConfig();
    const showAddDriveModal = useShowAddDriveModal();
    const connectDebug = localStorage.getItem('CONNECT_DEBUG') === 'true';

    const onClickSettings = () => {
        showModal('settingsModal', { onRefresh: () => navigate(0) });
    };

    const onRootClick = useCallback(() => {
        setSelectedNode(null);
        navigate('/');
    }, [navigate, setSelectedNode]);

    const onAddDriveClick = useCallback(() => {
        showAddDriveModal();
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
                    aria-label="Home"
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

    const etherscanUrl = user?.address
        ? `https://etherscan.io/address/${user.address}`
        : '';

    return (
        <ConnectSidebar
            id="sidebar"
            onClick={() => onRootClick()}
            onClickSettings={onClickSettings}
            headerContent={headerContent}
            address={user?.address}
            onLogin={openRenown}
            onDisconnect={logout}
            etherscanUrl={etherscanUrl}
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
                {config.drives.addDriveEnabled && (
                    <SidebarAddDriveItem onClick={onAddDriveClick} />
                )}
            </ErrorBoundary>
        </ConnectSidebar>
    );
}
