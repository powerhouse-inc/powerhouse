import { ConnectSidebar } from '@powerhousedao/design-system';
import { useAtom, useAtomValue } from 'jotai';
import { useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { useENSInfo } from 'src/hooks/useEnsInfo';
import { sidebarCollapsedAtom } from 'src/store';
import { userAtom } from 'src/store/user';
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

    const user = useAtomValue(userAtom);
    const ensInfo = useENSInfo(user?.address, user?.chainId);

    function toggleCollapse() {
        setCollapsed(value => !value);
    }

    const onClickSettings = () => {
        showModal('settingsModal', {});
    };

    return (
        <ConnectSidebar
            collapsed={collapsed}
            onToggle={toggleCollapse}
            username={ensInfo?.name || ''}
            avatarUrl={ensInfo?.avatarUrl || ''}
            onClickSettings={onClickSettings}
            address={user?.address ? shortAddress(user.address) : '-'}
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
