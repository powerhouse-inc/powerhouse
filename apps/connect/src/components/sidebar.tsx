import { ConnectSidebar } from '@powerhousedao/design-system';
import { useAtom, useAtomValue } from 'jotai';
import { useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
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
            username="Willow.eth"
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
