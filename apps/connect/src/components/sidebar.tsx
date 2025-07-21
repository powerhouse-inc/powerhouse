import { useConnectConfig, useLogin, useShowAddDriveModal } from '#hooks';
import {
    ConnectSidebar,
    Icon,
    SidebarAddDriveItem,
    SidebarItem,
} from '@powerhousedao/design-system';
import {
    useSetSelectedDrive,
    useUnwrappedDrives,
    useUnwrappedSelectedDrive,
} from '@powerhousedao/state';
import { type DocumentDriveDocument, logger } from 'document-drive';
import { useCallback } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { useNavigate } from 'react-router-dom';
import { DriveIcon } from './drive-icon.js';
import { useModal } from './modal/index.js';

export default function Sidebar() {
    const { showModal } = useModal();
    const navigate = useNavigate();

    const { user, openRenown, logout } = useLogin();
    const drives = useUnwrappedDrives();
    const selectedDrive = useUnwrappedSelectedDrive();
    const setSelectedDrive = useSetSelectedDrive();
    const [config] = useConnectConfig();
    const showAddDriveModal = useShowAddDriveModal();
    const connectDebug = localStorage.getItem('CONNECT_DEBUG') === 'true';

    const onClickSettings = () => {
        showModal('settingsModal', { onRefresh: () => navigate(0) });
    };

    const onRootClick = useCallback(() => {
        setSelectedDrive(undefined);
        navigate('/');
    }, [navigate, setSelectedDrive]);

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
        (drive: DocumentDriveDocument) => {
            setSelectedDrive(drive.header.id);
        },
        [setSelectedDrive],
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
                {drives?.map((drive, index) => (
                    <SidebarItem
                        key={index}
                        title={drive.header.name}
                        onClick={() => handleDriveClick(drive)}
                        active={selectedDrive?.header.id === drive.header.id}
                        icon={<DriveIcon drive={drive} />}
                    />
                ))}
                {config.drives.addDriveEnabled && (
                    <SidebarAddDriveItem onClick={onAddDriveClick} />
                )}
            </ErrorBoundary>
        </ConnectSidebar>
    );
}
