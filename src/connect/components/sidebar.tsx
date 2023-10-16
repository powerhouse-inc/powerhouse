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
                className="flex-1 border border-neutral-3 rounded-md py-3 px-5 leading-none placeholder-shown:bg-transparent"
            />
            <Button
                className="border border-neutral-3 rounded-md p-[14px]"
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
    <div className="flex gap-2 bg-white px-4 py-[10px]">
        <img
            src={ImgPowerhouse}
            alt={username}
            width={40}
            height={40}
            className="object-contain"
        />
        <div>
            <p className="font-semibold text-sm text-[#404446]">{username}</p>
            <p className="font-semibold text-xs text-[#94A3B8]">{address}</p>
        </div>
    </div>
);

const ConnectSidebarFooter: React.FC<SidebarUserProps> = props => {
    return (
        <>
            <SidebarUser {...props} />
            <Button className="flex gap-3 px-5 py-3 w-full">
                <IconSettings />
                <span className="font-semibold text-sm leading-6 text-[#404446]">
                    Settings
                </span>
            </Button>
        </>
    );
};

interface ConnectSidebarProps
    extends SidebarProps,
        SidebarHeaderProps,
        SidebarUserProps {}

export const ConnectSidebar: React.FC<ConnectSidebarProps> = ({
    onToggle,
    username,
    address,
    ...props
}) => {
    return (
        <Sidebar {...props}>
            <SidebarHeader className="pt-11 px-2 flex gap-4">
                <ConnectSidebarHeader onToggle={onToggle} />
            </SidebarHeader>
            {props.children}
            <SidebarFooter className="p-4 border-t border-[#2326271A]">
                <ConnectSidebarFooter username={username} address={address} />
            </SidebarFooter>
        </Sidebar>
    );
};
