import ImgPowerhouse from '@/assets/powerhouse-rounded.png';
import { CSSProperties } from 'react';
import { useEnsAvatar, useEnsName } from 'wagmi';

type Props = {
    address: `0x${string}`;
    chainId?: number;
    size?: CSSProperties['width'];
};
export function ENSAvatar(props: Props) {
    const { address, chainId = 1, size = '14px' } = props;
    const style = {
        width: size,
        height: size,
    };
    const ensNameResult = useEnsName({ address, chainId });
    const name = ensNameResult.data ?? undefined;
    const ensAvatarResult = useEnsAvatar({ name });
    const avatarUrl = ensAvatarResult.data ?? ImgPowerhouse;
    const isLoading = ensNameResult.isLoading || ensAvatarResult.isLoading;

    if (isLoading)
        return (
            <div
                style={style}
                className="flex-none animate-pulse rounded-full bg-gray-400 fade-out"
            ></div>
        );

    return (
        <img
            src={avatarUrl}
            style={style}
            className="flex-none rounded-full object-contain"
            alt="ENS Avatar"
        />
    );
}
