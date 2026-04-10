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

    const controller = new AbortController();
    setIsLoading(true);
    setError(undefined);

    fetch(`https://api.ensdata.net/${address}`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`ENS lookup failed: ${res.status}`);
        return res.json() as Promise<EnsData>;
      })
      .then((json) => {
        setData(json);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err : new Error("ENS lookup failed"));
      })
      .finally(() => {
        setIsLoading(false);
      });

    return () => controller.abort();
  }, [address]);

  return { data, isLoading, error };
}
