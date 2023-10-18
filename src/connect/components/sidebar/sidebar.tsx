import { Sidebar, SidebarPanel, SidebarProps } from '@/powerhouse';
import {
    ConnectSidebarFooter,
    ConnectSidebarFooterProps,
} from './sidebar-footer';
import {
    ConnectSidebarHeader,
    ConnectSidebarHeaderProps,
} from './sidebar-header';

export interface ConnectSidebarProps
    extends Omit<SidebarProps, 'maxWidth' | 'minWidth'>,
        ConnectSidebarHeaderProps,
        ConnectSidebarFooterProps {
    maxWidth?: string;
    minWidth?: string;
}

export const ConnectSidebar: React.FC<ConnectSidebarProps> = ({
    onToggle,
    username,
    address,
    collapsed = false,
    maxWidth = '304px',
    minWidth = '58px',
    ...props
}) => {
    return (
        <Sidebar
            {...props}
            collapsed={collapsed}
            maxWidth={maxWidth}
            minWidth={minWidth}
        >
            <SidebarPanel>
                <ConnectSidebarHeader
                    className="pt-11 px-2 flex gap-4 justify-center"
                    onToggle={onToggle}
                />
                {!collapsed ? props.children : null}
            </SidebarPanel>
            <ConnectSidebarFooter
                username={username}
                address={address}
                className="border-t border-[#2326271A] p-4 collapsed:p-1"
            />
        </Sidebar>
    );
};
