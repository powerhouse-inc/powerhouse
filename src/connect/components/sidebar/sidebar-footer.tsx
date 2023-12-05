import { Icon, SidebarFooter, SidebarFooterProps } from '@/powerhouse';
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
                'border-t border-slate-700/10 p-4 collapsed:px-1 expanding:px-1',
                className,
            )}
        >
            <SidebarUser username={username} address={address} />
            <Button className="flex w-full gap-3 px-5 py-3 collapsed:px-3 expanding:px-3">
                <Icon name="settings" />
                <span className="text-sm font-semibold leading-6 text-grey-800 collapsed:hidden expanding:hidden">
                    Settings
                </span>
            </Button>
        </SidebarFooter>
    );
};
