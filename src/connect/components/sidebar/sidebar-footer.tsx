import { Icon, SidebarFooter, SidebarFooterProps } from '@/powerhouse';
import { Button } from 'react-aria-components';
import { twMerge } from 'tailwind-merge';
import { SidebarLogin } from './sidebar-login';
import { SidebarUser } from './sidebar-user';

export interface ConnectSidebarFooterProps extends SidebarFooterProps {
    address: `0x${string}` | undefined;
    onClickSettings?: () => void;
    onLogin: () => void;
}

export const ConnectSidebarFooter: React.FC<ConnectSidebarFooterProps> = ({
    address,
    className,
    onLogin,
    onClickSettings,
    ...props
}) => {
    return (
        <SidebarFooter
            {...props}
            className={twMerge(
                'bg-gray-50 p-4 collapsed:px-1 expanding:px-1',
                className,
            )}
        >
            <div className="collapsed:bg-transparent collapsing:bg-transparent expanding:bg-transparent">
                {address ? (
                    <SidebarUser address={address} />
                ) : (
                    <SidebarLogin onLogin={onLogin} />
                )}
            </div>
            <Button
                className="mt-3 flex w-full cursor-pointer gap-3 outline-none collapsed:px-3 expanding:px-3"
                onPress={onClickSettings}
            >
                <Icon name="settings" className="text-gray-600" />
                <span className="text-sm font-semibold leading-6 text-gray-800 collapsed:hidden expanding:hidden">
                    Settings
                </span>
            </Button>
        </SidebarFooter>
    );
};
