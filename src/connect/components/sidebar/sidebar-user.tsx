import ImgPowerhouse from '@/assets/powerhouse-rounded.png';
import { twMerge } from 'tailwind-merge';

export interface SidebarUserProps {
    username: string;
    address: string;
    avatarUrl?: string;
    loadingUser?: boolean;
}

export const SidebarUser: React.FC<SidebarUserProps> = ({
    username,
    address,
    avatarUrl,
    loadingUser,
}) => {
    return (
        <div
            className={`flex gap-2 rounded-sm px-3 py-2.5 collapsed:justify-center
            collapsed:bg-transparent collapsed:px-1 collapsing:bg-transparent
            expanding:justify-center expanding:bg-transparent expanding:px-1
        `}
        >
            <img
                src={avatarUrl || ImgPowerhouse}
                alt={username}
                width={40}
                height={40}
                className={twMerge(
                    'rounded-full object-contain',
                    loadingUser && 'animate-pulse',
                )}
            />
            <div className="collapsed:hidden expanding:hidden">
                <p
                    className={twMerge(
                        'text-sm font-semibold text-gray-800',
                        loadingUser && 'animate-pulse rounded',
                    )}
                >
                    {username}
                </p>
                <p
                    className={twMerge(
                        'text-xs font-semibold text-gray-600',
                        loadingUser && 'animate-pulse rounded',
                    )}
                >
                    {address}
                </p>
            </div>
        </div>
    );
};
