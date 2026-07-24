import { mockAdapterMeta } from "./mock/meta.js";
import { privyAdapterMeta } from "./privy/meta.js";
import { rainbowAdapterMeta } from "./rainbow/meta.js";
import type {
  LoginMethod,
  WalletAdapter,
  WalletAdapterFactory,
  WalletAdapterMeta,
} from "./types.js";

// Structural config slices the core codes against; each adapter subexport accepts
// a compatible config. Kept local so the core imports no wallet-lib or shared type.
export interface WalletRainbowConfig {
  walletConnectProjectId: string;
  infuraProjectId?: string;
  // Set on server-rendered hosts (e.g. Next.js) so wagmi defers its hydrate
  // reconnect to an effect instead of running it during render.
  ssr?: boolean;
}

export interface WalletPrivyConfig {
  appId: string;
  clientId?: string;
  methods?: string[];
}

// TEST/DEV only: a headless signer backed by a local key. Never enable in prod.
export interface WalletMockConfig {
  privateKey?: `0x${string}`;
  chainId?: number;
  methods?: string[];
}

export interface WalletAdaptersConfig {
  rainbow?: WalletRainbowConfig;
  privy?: WalletPrivyConfig;
  mock?: WalletMockConfig;
}

// Adapter descriptors, imported eagerly (each is dependency-free — no wallet
// library). Their factories still load lazily via resolveAdapters below.
const ADAPTER_METAS: WalletAdapterMeta[] = [
  rainbowAdapterMeta,
  privyAdapterMeta,
  mockAdapterMeta,
];

// True when a URL search string looks like a wallet OAuth redirect return, per
// each adapter's own declared params — no adapter-specific strings live here.
export function isWalletRedirectReturn(search: string): boolean {
  const params = new URLSearchParams(search);
  return ADAPTER_METAS.some((meta) =>
    meta.redirectReturnParams.some((param) => params.has(param)),
  );
}

// Peer dependencies each adapter subexport imports; listed in the error message
// when a dynamic import fails so operators know exactly what to install.
const ADAPTER_PEER_DEPS: Record<string, string[]> = {
  rainbow: ["wagmi", "@rainbow-me/rainbowkit", "@tanstack/react-query", "viem"],
  privy: ["@privy-io/react-auth", "viem"],
  mock: ["viem"],
};

// A module-not-found from a dynamic import means the adapter's optional peer
// dependency isn't installed; explain it in plain language instead of the raw error.
function logAdapterLoadError(
  id: "rainbow" | "privy" | "mock",
  error: unknown,
): void {
  const deps = ADAPTER_PEER_DEPS[id].join(", ");
  console.error(
    `[renown] Could not load the "${id}" wallet adapter. It is enabled in renown.adapters but its peer dependencies are not installed. Install them to use it: ${deps} — or remove "${id}" from renown.adapters.`,
    error,
  );
}

// Dynamically import ONLY the adapters an operator configured; the wallet-lib
// code and its peer dep load only when the matching dynamic import runs.
export async function resolveAdapters(
  config: WalletAdaptersConfig | undefined,
): Promise<WalletAdapter[]> {
  const adapters: WalletAdapter[] = [];
  if (!config) return adapters;
  if (config.rainbow) {
    try {
      const mod = (await import("@renown/sdk/wallet/rainbow")) as unknown as {
        createRainbowAdapter: WalletAdapterFactory<WalletRainbowConfig>;
      };
      adapters.push(mod.createRainbowAdapter(config.rainbow));
    } catch (error) {
      logAdapterLoadError("rainbow", error);
    }
  }
  if (config.privy) {
    try {
      const mod = (await import("@renown/sdk/wallet/privy")) as unknown as {
        createPrivyAdapter: WalletAdapterFactory<WalletPrivyConfig>;
      };
      adapters.push(mod.createPrivyAdapter(config.privy));
    } catch (error) {
      logAdapterLoadError("privy", error);
    }
  }
  if (config.mock) {
    try {
      const mod = (await import("@renown/sdk/wallet/mock")) as unknown as {
        createMockAdapter: WalletAdapterFactory<WalletMockConfig>;
      };
      adapters.push(mod.createMockAdapter(config.mock));
    } catch (error) {
      logAdapterLoadError("mock", error);
    }
  }
  return adapters;
}

// Union of all login methods supported across the resolved adapters.
export function supportedMethods(adapters: WalletAdapter[]): LoginMethod[] {
  const methods = new Set<LoginMethod>();
  for (const adapter of adapters) {
    for (const method of adapter.supportedMethods) methods.add(method);
  }
  return Array.from(methods);
}

// Return the sole adapter that supports `method`; throws if none or more than one
// does (ambiguous config — the caller must resolve the adapter explicitly).
export function resolveForMethod(
  adapters: WalletAdapter[],
  method: LoginMethod,
): WalletAdapter {
  const matches = adapters.filter((a) => a.supportedMethods.includes(method));
  if (matches.length > 1) {
    throw new Error(
      `Multiple adapters support login method "${method}": ${matches
        .map((a) => a.id)
        .join(", ")}. Resolve the adapter explicitly.`,
    );
  }
  const adapter = matches.at(0);
  if (!adapter) {
    throw new Error(`No adapter registered for login method "${method}"`);
  }
  return adapter;
}
