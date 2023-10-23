import IconSettings from '@/assets/icons/settings.svg?react';
import { SidebarFooter, SidebarFooterProps } from '@/powerhouse';
import { Button } from 'react-aria-components';
import { twMerge } from 'tailwind-merge';
import { SidebarUser, SidebarUserProps } from './sidebar-user';

export interface ConnectSidebarFooterProps
    extends SidebarFooterProps,
        SidebarUserProps {}

export const ConnectSidebarFooter: React.FC<ConnectSidebarFooterProps> = ({
    username,
    address,
    className,
    ...props
}) => {
    return (
        <SidebarFooter
            {...props}
            className={twMerge(
                'border-t border-[#2326271A] p-4 collapsed:px-1',
                className,
            )}
        >
            <SidebarUser username={username} address={address} />
            <Button className="flex gap-3 py-3 w-full px-5 collapsed:px-3">
                <IconSettings />
                <span className="font-semibold text-sm leading-6 text-[#404446] collapsed:hidden">
                    Settings
                </span>
            </Button>
        </SidebarFooter>
    );
};
