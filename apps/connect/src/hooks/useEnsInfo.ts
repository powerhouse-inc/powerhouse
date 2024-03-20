import { useEffect, useState } from 'react';
import { getEnsInfo, type ENSInfo } from 'src/services/viem';

export function useENSInfo(
    address?: `0x${string}`,
    chainId?: number,
): ENSInfo | undefined {
    const [info, setInfo] = useState<ENSInfo | undefined>(undefined);

    useEffect(() => {
        if (!address || !chainId) {
            return;
        }
        getEnsInfo(address, chainId)
            .then(info => setInfo(info))
            .catch(console.error);
    }, [address, chainId]);

    return info;
}
