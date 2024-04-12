/* eslint-disable tailwindcss/no-arbitrary-value */
import { ConnectSidebar, Icon } from '@powerhousedao/design-system';
import { useAtom } from 'jotai';
import { useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { useNavigate } from 'react-router-dom';
import { useLogin } from 'src/hooks/useLogin';
import { sidebarCollapsedAtom } from 'src/store';
import DriveContainer from './drive-container';
import { useModal } from './modal';

function shortAddress(address: string) {
    return (
        address.substring(0, 6) + '...' + address.substring(address.length - 6)
    );
}

export default function Sidebar() {
    const [collapsed, setCollapsed] = useAtom(sidebarCollapsedAtom);
    const [disableHoverStyles, setDisableHoverStyles] = useState(false);
    const { showModal } = useModal();
    const navigate = useNavigate();

    const { user, openRenown, status } = useLogin();

    function toggleCollapse() {
        setCollapsed(value => !value);
    }

    const onClickSettings = () => {
        showModal('settingsModal', { onRefresh: () => navigate(0) });
    };

    const headerContent = (
        <div className="flex h-full items-center">
            <Icon name="connect" className="!h-[30px] !w-[100px]" />
        </div>
    );

    return (
        <ConnectSidebar
            collapsed={collapsed}
            onToggle={toggleCollapse}
            username={user?.ens?.name || ''}
            avatarUrl={user?.ens?.avatarUrl}
            onClickSettings={onClickSettings}
            headerContent={headerContent}
            address={user?.address ? shortAddress(user.address) : ''}
            loadingUser={status === 'checking'}
            onLogin={openRenown}
        >
            <ErrorBoundary
                fallback={
                    <div className="text-center">
                        There was an error loading drives
                    </div>
                }
                onError={console.error}
            >
                <DriveContainer
                    disableHoverStyles={disableHoverStyles}
                    setDisableHoverStyles={setDisableHoverStyles}
                />
            </ErrorBoundary>
        </ConnectSidebar>
    );
}
