import ImgPowerhouse from '@/assets/powerhouse-rounded.png';
import { useEffect, useState } from 'react';
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
    const [loadingImage, setLoadingImage] = useState(false);
    const [imageError, setImageError] = useState(false);
    useEffect(() => {
        setImageError(false);
        setLoadingImage(!avatarUrl);
    }, [avatarUrl]);
    const loading = loadingUser || (avatarUrl && loadingImage);
    return (
        <div
            className={`flex gap-2 rounded-sm px-3 py-2.5 collapsed:justify-center
            collapsed:px-1 expanding:justify-center expanding:px-1
        `}
        >
            <img
                src={imageError || !avatarUrl ? ImgPowerhouse : avatarUrl}
                alt={username}
                width={40}
                height={40}
                className={twMerge(
                    'rounded-full object-contain',
                    loading && 'animate-pulse',
                )}
                onLoad={() => setLoadingImage(false)}
                onError={() => {
                    setLoadingImage(false);
                    setImageError(true);
                }}
            />
            <div className="collapsed:hidden expanding:hidden">
                <p
                    className={twMerge(
                        'text-sm font-semibold text-gray-800',
                        loading && 'animate-pulse rounded',
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
