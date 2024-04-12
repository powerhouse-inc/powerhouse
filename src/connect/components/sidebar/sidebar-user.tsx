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
                    'size-10 rounded-full object-contain transition-opacity',
                    loading && 'animate-pulse',
                    !loading && avatarUrl && 'duration-1000 animate-in fade-in',
                )}
                onLoad={() => setLoadingImage(false)}
                onError={() => {
                    setLoadingImage(false);
                    setImageError(true);
                }}
            />
            <div className="w-full collapsed:hidden expanding:hidden">
                <p className="h-6 text-sm font-semibold text-gray-800">
                    {loading ? (
                        <span className="block h-1/2 w-2/3 translate-y-1/2 animate-pulse rounded bg-gray-400"></span>
                    ) : (
                        <span className="duration-1000 animate-in fade-in">
                            {username}
                        </span>
                    )}
                </p>
                <p className="h-[18px] text-xs font-semibold text-gray-600">
                    {loading ? (
                        <span className="block size-2/3 translate-y-1/3 animate-pulse rounded bg-gray-400"></span>
                    ) : (
                        <span className="duration-1000 animate-in fade-in">
                            {address}
                        </span>
                    )}
                </p>
            </div>
        </div>
    );
};
