import {
  getDefaultConfig as rainbowGetDefaultConfig,
  getDefaultWallets as rainbowGetDefaultWallets,
} from "@rainbow-me/rainbowkit";
import { http, type Config } from "wagmi";
import {
  arbitrum,
  base,
  mainnet,
  optimism,
  polygon,
  sepolia,
} from "wagmi/chains";

// RainbowKit ships types via an exports map with no "types" condition, so
// type-aware lint sees them as error-typed; assert the shapes we rely on.
type WalletCreator = { name?: string };
type WalletGroup = { groupName: string; wallets: WalletCreator[] };
const getDefaultConfig = rainbowGetDefaultConfig as (params: {
  appName: string;
  projectId: string;
  chains: readonly [unknown, ...unknown[]];
  wallets?: WalletGroup[];
  transports: Record<number, unknown>;
  ssr?: boolean;
}) => Config;
const getDefaultWallets = rainbowGetDefaultWallets as () => {
  wallets: WalletGroup[];
};

// Config slice this adapter consumes; mirrors WalletRainbowConfig in the core
// controller so operators pass the same shape from powerhouse.config.json.
export interface PHRenownRainbowAdapterConfig {
  walletConnectProjectId: string;
  infuraProjectId?: string;
  appName?: string;
  // See WalletRainbowConfig.ssr: opt-in for server-rendered hosts.
  ssr?: boolean;
}

// RainbowKit's default wallet list minus the WalletConnect option, used when no
// project id is set (WalletConnect can't work without one; injected wallets do).
function walletsWithoutWalletConnect(): WalletGroup[] {
  return getDefaultWallets()
    .wallets.map((group) => ({
      ...group,
      wallets: group.wallets.filter((w) => w.name !== "walletConnectWallet"),
    }))
    .filter((group) => group.wallets.length > 0);
}

// Build the wagmi + RainbowKit config from operator-provided project ids.
// Ported from renown/utils/wagmi.ts (env vars replaced by config fields).
export function buildWagmiConfig(config: PHRenownRainbowAdapterConfig): Config {
  const {
    walletConnectProjectId,
    infuraProjectId,
    appName = "Renown",
    ssr,
  } = config;

  if (!walletConnectProjectId) {
    console.debug(
      "renown rainbow adapter: walletConnectProjectId is not set — hiding the WalletConnect option; only injected/browser wallets are offered.",
    );
  }

  const infuraUrl = (subdomain: string) =>
    infuraProjectId
      ? `https://${subdomain}.infura.io/v3/${infuraProjectId}`
      : undefined;

  return getDefaultConfig({
    appName,
    projectId: walletConnectProjectId || "MISSING_WALLET_CONNECT_PROJECT_ID",
    chains: [mainnet, sepolia, polygon, optimism, arbitrum, base],
    // On SSR hosts wagmi's Hydrate defers reconnect to an effect; without it that
    // runs during render, which setState-in-render warns via RainbowKit's modal.
    ssr,
    // Omit `wallets` to keep RainbowKit's default set when a project id exists;
    // otherwise drop only the WalletConnect option from that default set.
    ...(walletConnectProjectId
      ? {}
      : { wallets: walletsWithoutWalletConnect() }),
    transports: {
      [mainnet.id]: http(infuraUrl("mainnet")),
      [sepolia.id]: http(infuraUrl("sepolia")),
      [polygon.id]: http(infuraUrl("polygon-mainnet")),
      [optimism.id]: http(infuraUrl("optimism-mainnet")),
      [arbitrum.id]: http(infuraUrl("arbitrum-mainnet")),
      [base.id]: http(infuraUrl("base-mainnet")),
    },
  });
}
