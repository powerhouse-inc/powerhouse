import { ConnectSidebar } from '@powerhousedao/design-system';
import { useAtom } from 'jotai';
import { sidebarCollapsedAtom } from 'src/store';
import DriveContainer from './drive-container';

export default function () {
    const [collapsed, setCollapsed] = useAtom(sidebarCollapsedAtom);
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
            <DriveContainer />
        </ConnectSidebar>
    );
}
