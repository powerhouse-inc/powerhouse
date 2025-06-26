import { useLogin } from '#hooks';
import {
    unwrapLoadable,
    useConfig,
    useDrives,
    useModal,
    useSetSelectedDrive,
    useUnwrappedSelectedDrive,
} from '@powerhousedao/common';
import {
    ConnectSidebar,
    Icon,
    SidebarAddDriveItem,
    SidebarItem,
} from '@powerhousedao/design-system';
import { type DocumentDriveDocument, logger } from 'document-drive';
import { useCallback } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

export default function Sidebar() {
    const { show: showSettingsModal } = useModal('settings');
    const { show: showAddDriveModal } = useModal('addDrive');
    const { show: showDebugSettingsModal } = useModal('debugSettings');
    const { user, openRenown, logout } = useLogin();
    const loadableDrives = useDrives();
    const documentDrives = unwrapLoadable(loadableDrives) ?? [];
    const selectedDrive = useUnwrappedSelectedDrive();
    const setSelectedDrive = useSetSelectedDrive();
    const config = useConfig();
    const connectDebug = localStorage.getItem('CONNECT_DEBUG') === 'true';

    const onClickSettings = () => {
        showSettingsModal();
    };

    const onRootClick = useCallback(() => {
        setSelectedDrive(undefined);
    }, [setSelectedDrive]);

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
                    onClick={() => showDebugSettingsModal()}
                >
                    <img src="settings.png" className="h-5 text-gray-600" />
                </button>
            )}
        </div>
    );

    const handleDriveClick = useCallback(
        (drive: DocumentDriveDocument) => {
            setSelectedDrive(drive.id);
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
                {documentDrives.map((drive, index) => (
                    <SidebarItem
                        key={index}
                        title={drive.name}
                        onClick={() => handleDriveClick(drive)}
                        active={selectedDrive?.id === drive.id}
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
