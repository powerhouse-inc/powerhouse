import ImgPowerhouse from '@/assets/powerhouse-rounded.png';
import { useState } from 'react';
import { twJoin, twMerge } from 'tailwind-merge';

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
    const [loadingImage, setLoadingImage] = useState(Boolean(avatarUrl));
    const [imageError, setImageError] = useState(false);

    function getImage() {
        if (!avatarUrl || imageError) {
            return <SidebarImage src={ImgPowerhouse} alt={username} />;
        }

        return (
            <>
                <div
                    className={twJoin(
                        'size-10 flex-none animate-pulse rounded-full bg-gray-400 fade-out',
                        !loadingImage && 'hidden',
                    )}
                ></div>
                <SidebarImage src={avatarUrl} alt={username} />
            </>
        );
    }

    const image = getImage();

    function SidebarImage(props: { src: string; alt: string }) {
        return (
            <img
                {...props}
                className={twMerge(
                    'size-10 flex-none rounded-full object-contain transition-opacity duration-1000 animate-in fade-in',
                    loadingImage && 'hidden',
                )}
                onLoad={() => setLoadingImage(false)}
                onError={() => {
                    setLoadingImage(false);
                    setImageError(true);
                }}
            />
        );
    }

    const usernameAndAddressLoader = (
        <>
            <p className="mb-2 h-4 w-4/5 animate-pulse rounded bg-gray-400"></p>
            <p className="h-3 w-4/5 animate-pulse rounded bg-gray-400"></p>
        </>
    );

    const usernameAndAddress = (
        <>
            <p className="mb-2 h-4 text-sm text-gray-800 duration-1000 animate-in fade-in">
                {username}
            </p>
            <p className="h-3 text-xs text-gray-600 duration-1000 animate-in fade-in">
                {address}
            </p>
        </>
    );

    const addressOnly = (
        <p className="text-sm text-gray-800 duration-1000 animate-in fade-in">
            {address}
        </p>
    );

    return (
        <div
            className="flex gap-2 rounded-sm py-2.5 collapsed:justify-center
            collapsed:px-1 expanding:justify-center expanding:px-1"
        >
            {image}
            <div className="grid w-full items-center font-semibold collapsed:hidden expanding:hidden">
                {loadingUser && usernameAndAddressLoader}
                {!loadingUser && !!username && usernameAndAddress}
                {!loadingUser && !username && addressOnly}
            </div>
        </div>
    );
};
