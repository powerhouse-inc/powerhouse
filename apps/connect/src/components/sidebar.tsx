import {
    useConnectConfig,
    useDocumentDrives,
    useLogin,
    useShowAddDriveModal,
} from '#hooks';
import {
    useSelectedDriveId,
    useSetSelectedNodeId,
} from '@powerhousedao/common';
import {
    ConnectSidebar,
    Icon,
    SidebarAddDriveItem,
    SidebarItem,
} from '@powerhousedao/design-system';
import { logger } from 'document-drive';
import { useCallback } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { useNavigate } from 'react-router-dom';

export default function Sidebar() {
    const { showModal } = useModal();
    const navigate = useNavigate();
    const { user, openRenown, logout } = useLogin();
    const [documentDrives] = useDocumentDrives();
    const setSelectedNodeId = useSetSelectedNodeId();
    const selectedDriveId = useSelectedDriveId();
    const [config] = useConnectConfig();
    const showAddDriveModal = useShowAddDriveModal();
    const connectDebug = localStorage.getItem('CONNECT_DEBUG') === 'true';

    const onClickSettings = () => {
        showModal('settingsModal', { onRefresh: () => navigate(0) });
    };

    const onRootClick = useCallback(() => {
        setSelectedNodeId(null);
        navigate('/');
    }, [navigate, setSelectedNodeId]);

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
        (driveId: string) => {
            setSelectedNodeId(driveId);
        },
        [setSelectedNodeId],
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
                {documentDrives.map((drive, index) => (
                    <SidebarItem
                        key={index}
                        title={drive.name}
                        onClick={() => handleDriveClick(drive.id)}
                        active={selectedDriveId === drive.id}
                        icon={
                            drive.state.global.icon ? (
                                <img
                                    src={drive.state.global.icon}
                                    alt={drive.name}
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
