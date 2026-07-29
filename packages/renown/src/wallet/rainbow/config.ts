import { getDefaultConfig as rainbowGetDefaultConfig } from "@rainbow-me/rainbowkit";
import {
  injectedWallet as rainbowInjectedWallet,
  safeWallet as rainbowSafeWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { http, type Config } from "wagmi";
import {
  arbitrum,
  base,
  mainnet,
  optimism,
  polygon,
  sepolia,
} from "wagmi/chains";
import type { PHRenownRainbowAdapterConfig } from "./meta.js";

// RainbowKit ships types via an exports map with no "types" condition, so
// type-aware lint sees them as error-typed; assert the shapes we rely on.
type WalletCreator = () => unknown;
interface WalletGroup {
  groupName: string;
  wallets: WalletCreator[];
}
const getDefaultConfig = rainbowGetDefaultConfig as (params: {
  appName: string;
  projectId: string;
  chains: readonly [unknown, ...unknown[]];
  wallets?: WalletGroup[];
  transports: Record<number, unknown>;
  ssr?: boolean;
}) => Config;
const injectedWallet = rainbowInjectedWallet as WalletCreator;
const safeWallet = rainbowSafeWallet as WalletCreator;

/** The wallets that work with no WalletConnect project id. Composed explicitly rather than subtracted from `getDefaultWallets()`: RainbowKit's other defaults fall back to WalletConnect themselves — `rainbowWallet` whenever its extension is absent, `metaMaskWallet` on desktop without the extension — so removing only the WalletConnect entry still leaves buttons that fail on the relay. `injectedWallet` and `safeWallet` are the two that never reach it. */
export function walletsWithoutWalletConnect(): WalletGroup[] {
  return [{ groupName: "Installed", wallets: [injectedWallet, safeWallet] }];
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
    console.warn(
      "renown rainbow adapter: walletConnectProjectId is not set — only an installed browser wallet (or a Safe App iframe) can sign in. Every other RainbowKit wallet connects over WalletConnect, which needs a project id.",
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
    // Omit `wallets` to keep RainbowKit's default set (which needs the project
    // id) when one exists; otherwise offer only the WalletConnect-free wallets.
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
