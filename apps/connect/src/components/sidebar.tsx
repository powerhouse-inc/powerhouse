import { useLogin } from '#hooks/useLogin';
import { logger } from '#services/logger';
import { sidebarCollapsedAtom } from '#store/index';
import {
    ConnectSidebar,
    Icon,
    useUiNodesContext,
} from '@powerhousedao/design-system';
import { useAtom } from 'jotai';
import { useCallback } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { useNavigate } from 'react-router-dom';
import DriveContainer from './drive-container';
import { useModal } from './modal';

export default function Sidebar() {
    const [collapsed, setCollapsed] = useAtom(sidebarCollapsedAtom);
    const { showModal } = useModal();
    const navigate = useNavigate();
    const { setSelectedNode } = useUiNodesContext();

    const { user, openRenown } = useLogin();

    const connectDebug = localStorage.getItem('CONNECT_DEBUG') === 'true';

    function toggleCollapse() {
        setCollapsed(value => !value);
    }

    const onClickSettings = () => {
        showModal('settingsModal', { onRefresh: () => navigate(0) });
    };

    const onRootClick = useCallback(() => {
        setSelectedNode(null);
        navigate('/');
    }, [navigate, setSelectedNode]);

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

    return (
        <ConnectSidebar
            id="sidebar"
            collapsed={collapsed}
            onToggle={toggleCollapse}
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
                <DriveContainer />
            </ErrorBoundary>
        </ConnectSidebar>
    );
}
