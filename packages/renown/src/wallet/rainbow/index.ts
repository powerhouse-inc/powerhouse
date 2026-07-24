// RainbowKit's modal styles; without them the connect modal renders unstyled.
// Loaded lazily with this adapter, so it costs nothing until it's activated.
import "@rainbow-me/rainbowkit/styles.css";
import { QueryClient } from "@tanstack/react-query";
import type { Config } from "wagmi";
import {
  disconnect as wagmiDisconnect,
  getAccount,
  signTypedData as wagmiSignTypedData,
  watchAccount,
  type GetAccountReturnType,
} from "wagmi/actions";
import type { SignCredentialTypedData } from "../../credential.js";
import {
  LoginMethod,
  type WalletAdapter,
  type WalletController,
  type WalletSession,
} from "../types.js";
import { createRainbowBridge } from "./bridge.js";
import {
  buildWagmiConfig,
  type PHRenownRainbowAdapterConfig,
} from "./config.js";
import { createRainbowProvider } from "./provider.js";

export type { PHRenownRainbowAdapterConfig } from "./config.js";

type ConnectedAccount = Extract<GetAccountReturnType, { status: "connected" }>;

// Wagmi actions accept the broader viem typed-data shape; buildAndSignCredential
// already strips EIP712Domain, so viem derives the domain type from `domain`.
function makeSignTypedData(
  config: Config,
  address: `0x${string}`,
): SignCredentialTypedData {
  return (args) =>
    wagmiSignTypedData(config, {
      account: address,
      domain: args.domain,
      types: args.types as Record<
        string,
        readonly { name: string; type: string }[]
      >,
      primaryType: args.primaryType,
      message: args.message,
    });
}

function toSession(config: Config, account: ConnectedAccount): WalletSession {
  return {
    address: account.address,
    chainId: account.chainId,
    signTypedData: makeSignTypedData(config, account.address),
  };
}

// wagmi + RainbowKit external-wallet adapter. connect() opens the RainbowKit
// modal and resolves once wagmi reports a connected account.
export function createRainbowAdapter(
  config: PHRenownRainbowAdapterConfig,
): WalletAdapter {
  const wagmiConfig = buildWagmiConfig(config);
  const queryClient = new QueryClient();
  const bridge = createRainbowBridge();
  const appName = config.appName ?? "Renown";

  const Provider = createRainbowProvider({
    wagmiConfig,
    queryClient,
    bridge,
    appName,
  });

  const controller: WalletController = {
    supportedMethods: [LoginMethod.WALLET],
    getSession() {
      const account = getAccount(wagmiConfig);
      return account.status === "connected"
        ? toSession(wagmiConfig, account)
        : undefined;
    },
    async disconnect() {
      await wagmiDisconnect(wagmiConfig);
    },
    connect(method?: LoginMethod) {
      if (method && method !== LoginMethod.WALLET) {
        return Promise.reject(
          new Error(
            `rainbow adapter does not support login method "${method}"`,
          ),
        );
      }

      const existing = getAccount(wagmiConfig);
      if (existing.status === "connected") {
        return Promise.resolve(toSession(wagmiConfig, existing));
      }

      return new Promise<WalletSession>((resolve, reject) => {
        const unwatch = watchAccount(wagmiConfig, {
          onChange(account) {
            if (account.status === "connected") {
              unwatch();
              bridge.setPendingReject(null);
              resolve(toSession(wagmiConfig, account));
            }
          },
        });
        bridge.setPendingReject((error) => {
          unwatch();
          reject(error);
        });
        // Wait for the RainbowKit Provider to publish the modal opener (it can
        // lag connect() during wagmi reconnect / StrictMode remount), then open.
        bridge.whenOpenConnectModalReady().then(
          (open) => {
            try {
              open();
            } catch (error) {
              unwatch();
              bridge.setPendingReject(null);
              reject(error instanceof Error ? error : new Error(String(error)));
            }
          },
          (error: unknown) => {
            unwatch();
            bridge.setPendingReject(null);
            reject(error instanceof Error ? error : new Error(String(error)));
          },
        );
      });
    },
  };

  return {
    id: "rainbow",
    supportedMethods: [LoginMethod.WALLET],
    Provider,
    useController: () => controller,
  };
}
