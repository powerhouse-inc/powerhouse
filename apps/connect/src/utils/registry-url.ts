import { connectConfig } from "../connect.config.js";

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

function toCdnUrl(baseUrl: string): string {
  // If the URL already includes /-/cdn, return as-is
  if (baseUrl.includes("/-/cdn")) return baseUrl;
  const base = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  return `${base}/-/cdn/`;
}

function getConfiguredRegistryUrls(): string[] {
  const registry = connectConfig.packagesRegistry;
  if (!registry) return [];
  return registry
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean)
    .map(toCdnUrl);
}

export function getDefaultRegistryCdnUrl(): string | undefined {
  const persisted = loadPersistedState();
  const urls = getConfiguredRegistryUrls();

  if (persisted) {
    if (persisted.selectedRegistryId === "custom") {
      if (persisted.customRegistryUrl) return persisted.customRegistryUrl;
    } else {
      const index = parseInt(
        persisted.selectedRegistryId.replace("registry-", ""),
        10,
      );
      if (!isNaN(index) && urls[index]) return urls[index];
    }
  }

  return urls[0];
}
