import { getDefaultConfig as rainbowGetDefaultConfig } from "@rainbow-me/rainbowkit";
import {
  injectedWallet as rainbowInjectedWallet,
  safeWallet as rainbowSafeWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { http, type Config } from "wagmi";
import { mainnet } from "wagmi/chains";
import { DEFAULT_RENOWN_CHAIN_ID } from "../../constants.js";
import type { PHRenownChain, PHRenownRainbowAdapterConfig } from "./meta.js";

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

/** The wallets that work with no WalletConnect project id. Composed rather than subtracted from `getDefaultWallets()`, whose other entries fall back to WalletConnect themselves, so dropping just its entry still leaves buttons that cannot connect. */
export function walletsWithoutWalletConnect(): WalletGroup[] {
  return [{ groupName: "Installed", wallets: [injectedWallet, safeWallet] }];
}

// Matches DEFAULT_RENOWN_CHAIN_ID: the issuer DID embeds the chain the wallet
// signs on, so offering others would let one wallet mint several identities.
const DEFAULT_CHAINS: readonly [PHRenownChain, ...PHRenownChain[]] = [mainnet];

// Keyed by id rather than by chain, which would import them. A chain that is not
// listed falls back to the RPC in its own definition.
const INFURA_SUBDOMAINS: Record<number, string> = {
  1: "mainnet",
  11155111: "sepolia",
  137: "polygon-mainnet",
  10: "optimism-mainnet",
  42161: "arbitrum-mainnet",
  8453: "base-mainnet",
};

// Build the wagmi + RainbowKit config from operator-provided project ids.
// Ported from renown/utils/wagmi.ts (env vars replaced by config fields).
export function buildWagmiConfig(config: PHRenownRainbowAdapterConfig): Config {
  const {
    walletConnectProjectId,
    infuraProjectId,
    appName = "Renown",
    chains = DEFAULT_CHAINS,
    ssr,
  } = config;

  // renown.signIn() rejects a session from any other chain, so say so here
  // rather than at the end of a login the user cannot complete.
  if (!chains.some((chain) => chain.id === Number(DEFAULT_RENOWN_CHAIN_ID))) {
    console.warn(
      `renown rainbow adapter: none of the configured chains is ${DEFAULT_RENOWN_CHAIN_ID}, the chain credentials are issued on — sign-in will be rejected unless the Renown chain id is configured to match.`,
    );
  }

  if (!walletConnectProjectId) {
    console.warn(
      "renown rainbow adapter: walletConnectProjectId is not set — only an installed browser wallet (or a Safe App iframe) can sign in. Every other RainbowKit wallet connects over WalletConnect, which needs a project id.",
    );
  }

  const infuraUrl = (chainId: number) => {
    const subdomain = INFURA_SUBDOMAINS[chainId];
    return infuraProjectId && subdomain
      ? `https://${subdomain}.infura.io/v3/${infuraProjectId}`
      : undefined;
  };

  return getDefaultConfig({
    appName,
    projectId: walletConnectProjectId || "MISSING_WALLET_CONNECT_PROJECT_ID",
    chains: chains as readonly [unknown, ...unknown[]],
    // On SSR hosts wagmi's Hydrate defers reconnect to an effect; without it that
    // runs during render, which setState-in-render warns via RainbowKit's modal.
    ssr,
    // Omit `wallets` to keep RainbowKit's default set (which needs the project
    // id) when one exists; otherwise offer only the WalletConnect-free wallets.
    ...(walletConnectProjectId
      ? {}
      : { wallets: walletsWithoutWalletConnect() }),
    transports: Object.fromEntries(
      chains.map((chain) => [chain.id, http(infuraUrl(chain.id))]),
    ),
  });
}
