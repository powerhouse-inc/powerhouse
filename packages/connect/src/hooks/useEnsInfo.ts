import { useEffect, useMemo, useState } from 'react';
import { getEnsInfo, type ENSInfo } from 'src/services/viem';

export function useENSInfo(
    address?: `0x${string}`,
    chainId?: number,
): { info: ENSInfo | undefined; loading: boolean } {
    const [info, setInfo] = useState<ENSInfo | undefined>(undefined);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!address || !chainId) {
            return;
        }
        setLoading(true);
        getEnsInfo(address, chainId)
            .then(info => setInfo(info))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [address, chainId]);

    return useMemo(() => ({ info, loading }) as const, [info, loading]);
}
