import ImgPowerhouse from '@/assets/powerhouse-rounded.png';
import { useENSInfo } from '@/connect/hooks';
import { CSSProperties, useState } from 'react';
import { twJoin, twMerge } from 'tailwind-merge';

type Props = {
    address: `0x${string}`;
    chainId?: number;
    size?: CSSProperties['width'];
};
export function ENSAvatar(props: Props) {
    const { address, chainId = 1, size = '14px' } = props;
    const { info } = useENSInfo(address, chainId);
    const avatarUrl = info?.avatarUrl;
    const [loadingImage, setLoadingImage] = useState(Boolean(avatarUrl));
    const [imageError, setImageError] = useState(false);
    const style = {
        width: size,
        height: size,
    };

    function getImage() {
        if (!avatarUrl || imageError) {
            return <SidebarImage src={ImgPowerhouse} alt="ENS avatar" />;
        }

        return (
            <>
                <div
                    className={twJoin(
                        'flex-none rounded-full bg-gray-400',
                        !loadingImage && 'hidden',
                    )}
                    style={style}
                ></div>
                <SidebarImage src={avatarUrl} alt="ENS avatar" />
            </>
        );
    }

    const image = getImage();

    function SidebarImage(props: { src: string; alt: string }) {
        return (
            <img
                {...props}
                style={style}
                className={twMerge(
                    'flex-none rounded-full object-contain',
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

    return image;
}
