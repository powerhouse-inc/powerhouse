import type { ENSInfo } from "#services";
import { getEnsInfo } from "#services";
import { useEffect, useMemo, useState } from "react";

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
      .then((info) => setInfo(info))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [address, chainId]);

  return useMemo(() => ({ info, loading }) as const, [info, loading]);
}
