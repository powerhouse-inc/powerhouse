import { formatEthAddress } from '@/connect/utils';
import { ENSAvatar } from '../../ens-avatar';

export type AddressProps = {
    address: `0x${string}`;
    chainId: number;
};

export function Address(props: AddressProps) {
    const { address, chainId } = props;
    const shortenedAddress = formatEthAddress(address);

    return (
        <span className="flex w-fit items-center gap-1 rounded-lg bg-gray-100 p-1 text-xs text-slate-100">
            <ENSAvatar address={address} chainId={chainId} />
            {shortenedAddress}
        </span>
    );
}
