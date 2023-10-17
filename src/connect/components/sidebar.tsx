import { Button } from 'react-aria-components';
import { Sidebar, SidebarFooter, SidebarHeader, SidebarProps } from '../..';
import IconArrowLeft from '../../assets/icons/arrow-left.svg?react';
import ImgPowerhouse from '../../assets/icons/powerhouse-rounded.png';
import IconSettings from '../../assets/icons/settings.svg?react';

interface SidebarHeaderProps {
    onToggle: () => void;
}

const ConnectSidebarHeader: React.FC<SidebarHeaderProps> = ({ onToggle }) => {
    return (
        <>
            <input
                placeholder="Create new document"
                className="flex-1 border border-neutral-3 rounded-md py-3 px-5 leading-none placeholder-shown:bg-transparent collapsed:hidden"
            />
            <Button
                className="border border-neutral-3 rounded-md p-3 collapsed:rotate-180"
                onPress={() => onToggle()}
            >
                <IconArrowLeft />
            </Button>
        </>
    );
};

interface SidebarUserProps {
    username: string;
    address: string;
}

const SidebarUser: React.FC<SidebarUserProps> = ({ username, address }) => (
    <div className="flex gap-2 bg-white py-[10px] px-3 collapsed:px-1 collapsed:justify-center">
        <img
            src={ImgPowerhouse}
            alt={username}
            width={40}
            height={40}
            className="object-contain"
        />
        <div className="collapsed:hidden">
            <p className="font-semibold text-sm text-[#404446]">{username}</p>
            <p className="font-semibold text-xs text-[#94A3B8]">{address}</p>
        </div>
    </div>
);

interface SidebarFooterProps extends SidebarUserProps {}

const ConnectSidebarFooter: React.FC<SidebarFooterProps> = ({ ...props }) => {
    return (
        <>
            <SidebarUser {...props} />
            <Button className="flex gap-3 py-3 w-full px-5 collapsed:px-3">
                <IconSettings />
                <span className="font-semibold text-sm leading-6 text-[#404446] collapsed:hidden">
                    Settings
                </span>
            </Button>
        </>
    );
};

interface ConnectSidebarProps
    extends SidebarProps,
        SidebarHeaderProps,
        SidebarFooterProps {}

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
            <SidebarHeader className="pt-11 px-2 flex gap-4 justify-center">
                <ConnectSidebarHeader onToggle={onToggle} />
            </SidebarHeader>
            {!collapsed ? props.children : null}
            <SidebarFooter className="border-t border-[#2326271A] p-4 collapsed:p-1">
                <ConnectSidebarFooter username={username} address={address} />
            </SidebarFooter>
        </Sidebar>
    );
};
