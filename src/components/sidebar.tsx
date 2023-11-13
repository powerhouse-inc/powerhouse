import { ConnectSidebar } from '@powerhousedao/design-system';
import { useAtom } from 'jotai';
import { useState } from 'react';
import { sidebarCollapsedAtom } from 'src/store';
import DriveContainer from './drive-container';

export default function () {
    const [collapsed, setCollapsed] = useAtom(sidebarCollapsedAtom);
    const [disableHoverStyles, setDisableHoverStyles] = useState(false);
    function toggleCollapse() {
        setCollapsed(value => !value);
    }

    return (
        <ConnectSidebar
            collapsed={collapsed}
            onToggle={toggleCollapse}
            username="Willow.eth"
            address="0x8343...3u432u32"
        >
            <DriveContainer
                disableHoverStyles={disableHoverStyles}
                setDisableHoverStyles={setDisableHoverStyles}
            />
        </ConnectSidebar>
    );
}
