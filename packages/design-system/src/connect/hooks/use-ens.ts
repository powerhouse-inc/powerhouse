import { useEffect, useState } from "react";

type EnsData = {
  ens: string;
  address: string;
  avatar: string | null;
  avatar_small: string | null;
  avatar_url: string | null;
  contentHash: string | null;
  header: string | null;
  header_url: string | null;
  ens_primary: string;
  resolverAddress: string;
  url: string | null;
  github: string | null;
  twitter: string | null;
  telegram: string | null;
  email: string | null;
  description: string | null;
  notice: string | null;
  keywords: string | null;
  discord: string | null;
};

type UseEnsResult = {
  data: EnsData | undefined;
  isLoading: boolean;
  error: Error | undefined;
};

const ensCache = new Map<`0x${string}`, Promise<EnsData | undefined>>();

function fetchEns(address: `0x${string}`): Promise<EnsData | undefined> {
  const cached = ensCache.get(address);
  if (cached) return cached;

  const promise = fetch(`https://api.ensdata.net/${address}`)
    .then((res) => {
      if (!res.ok) throw new Error(`ENS lookup failed: ${res.status}`);
      return res.json() as Promise<EnsData>;
    })
    .catch((err: unknown) => {
      ensCache.delete(address);
      throw err instanceof Error ? err : new Error("ENS lookup failed");
    });

  ensCache.set(address, promise);
  return promise;
}

export function useEns(address: `0x${string}` | undefined): UseEnsResult {
  const [data, setData] = useState<EnsData>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error>();

  useEffect(() => {
    if (!address) {
      setData(undefined);
      setError(undefined);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(undefined);

    fetchEns(address)
      .then((json) => {
        if (cancelled) return;
        setData(json);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error("ENS lookup failed"));
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [address]);

  return { data, isLoading, error };
}
