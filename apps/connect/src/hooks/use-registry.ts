import { connectConfig } from "../connect.config.js";
import type {
  RegistryOption,
  RegistryPackageInfo,
  RegistryStatus,
} from "@powerhousedao/design-system/connect";
import { useCallback, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "ph-connect-registry-selection";

interface RegistryPersistedState {
  selectedRegistryId: string;
  customRegistryUrl: string;
}

function loadPersistedState(): RegistryPersistedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as RegistryPersistedState;
  } catch {
    // ignore
  }
  return null;
}

function persistState(state: RegistryPersistedState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function deriveLabelFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      return "Local";
    }
    return host;
  } catch {
    return url;
  }
}

function cdnUrlToApiUrl(cdnUrl: string): string {
  return cdnUrl.replace(/\/-\/cdn\/?$/, "");
}

function buildRegistries(
  packagesRegistry: string | undefined,
): RegistryOption[] {
  const registries: RegistryOption[] = [];

  if (packagesRegistry) {
    const urls = packagesRegistry
      .split(",")
      .map((u) => u.trim())
      .filter(Boolean);

    urls.forEach((url, index) => {
      registries.push({
        id: `registry-${index}`,
        label: deriveLabelFromUrl(url),
        url,
      });
    });
  }

  registries.push({
    id: "custom",
    label: "Custom",
    url: "",
    editable: true,
  });

  return registries;
}

interface PackageInfoFromApi {
  name: string;
  manifest?: {
    description?: string;
    version?: string;
    category?: string;
    publisher?: {
      name?: string;
      url?: string;
    };
  };
}

export function useRegistry() {
  const registries = useMemo(
    () => buildRegistries(connectConfig.packagesRegistry),
    [],
  );

  const persisted = useMemo(() => loadPersistedState(), []);

  const [selectedRegistryId, setSelectedRegistryId] = useState(
    () => persisted?.selectedRegistryId ?? registries[0]?.id ?? "custom",
  );

  const [customRegistryUrl, setCustomRegistryUrl] = useState(
    () => persisted?.customRegistryUrl ?? "",
  );

  const [registryStatus, setRegistryStatus] = useState<RegistryStatus>("idle");
  const [availablePackages, setAvailablePackages] = useState<
    RegistryPackageInfo[]
  >([]);

  const selectedRegistry = useMemo(
    () => registries.find((r) => r.id === selectedRegistryId),
    [registries, selectedRegistryId],
  );

  const effectiveRegistryUrl = useMemo(() => {
    if (!selectedRegistry) return "";
    if (selectedRegistry.editable) return customRegistryUrl;
    return selectedRegistry.url;
  }, [selectedRegistry, customRegistryUrl]);

  const apiUrl = useMemo(
    () => (effectiveRegistryUrl ? cdnUrlToApiUrl(effectiveRegistryUrl) : ""),
    [effectiveRegistryUrl],
  );

  // Persist selection
  useEffect(() => {
    persistState({ selectedRegistryId, customRegistryUrl });
  }, [selectedRegistryId, customRegistryUrl]);

  // Fetch packages on registry change
  useEffect(() => {
    if (!apiUrl) {
      setRegistryStatus("idle");
      setAvailablePackages([]);
      return;
    }

    let cancelled = false;
    setRegistryStatus("connecting");

    fetch(`${apiUrl}/packages`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<PackageInfoFromApi[]>;
      })
      .then((data) => {
        if (cancelled) return;
        const packages: RegistryPackageInfo[] = data.map((pkg) => ({
          name: pkg.name,
          description: pkg.manifest?.description,
          version: pkg.manifest?.version,
          category: pkg.manifest?.category,
          publisher: pkg.manifest?.publisher?.name,
          publisherUrl: pkg.manifest?.publisher?.url,
        }));
        setAvailablePackages(packages);
        setRegistryStatus("connected");
      })
      .catch(() => {
        if (cancelled) return;
        setRegistryStatus("error");
        setAvailablePackages([]);
      });

    return () => {
      cancelled = true;
    };
  }, [apiUrl]);

  const fetchPackages = useCallback(
    async (query: string): Promise<RegistryPackageInfo[]> => {
      if (!apiUrl) return [];
      const lowerQuery = query.toLowerCase();
      return availablePackages.filter(
        (pkg) =>
          pkg.name.toLowerCase().includes(lowerQuery) ||
          pkg.description?.toLowerCase().includes(lowerQuery),
      );
    },
    [apiUrl, availablePackages],
  );

  return {
    registries,
    selectedRegistryId,
    registryStatus,
    effectiveRegistryUrl,
    customRegistryUrl,
    availablePackages,
    setSelectedRegistryId,
    setCustomRegistryUrl,
    fetchPackages,
  };
}
