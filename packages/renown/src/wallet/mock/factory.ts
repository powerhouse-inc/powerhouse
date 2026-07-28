import { privateKeyToAccount } from "viem/accounts";
import type { ComponentType, ReactNode } from "react";
import type { SignCredentialTypedData } from "../../credential.js";
import type {
  WalletAdapterImpl,
  WalletController,
  WalletSession,
} from "../types.js";
import { resolveMockMethods, type PHRenownMockAdapterConfig } from "./meta.js";

type Hex = `0x${string}`;

// Well-known Anvil/Hardhat test account #0 private key. Default so tests need no
// key; every connect resolves to its deterministic address.
const DEFAULT_TEST_KEY: Hex =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const MockProvider: ComponentType<{ children: ReactNode }> = (props) =>
  props.children;

/** Headless test/dev wallet adapter: `connect()` resolves immediately with a session backed by a viem local account (real EIP-712 signatures, no wallet UI or OAuth). **TEST/DEV ONLY; never enable in production** — it signs with a known key. See the reactor-browser README "Testing" and the Academy Renown auth guide. */
export function createMockAdapter(
  config: PHRenownMockAdapterConfig,
): WalletAdapterImpl {
  const account = privateKeyToAccount(config.privateKey ?? DEFAULT_TEST_KEY);
  const chainId = config.chainId ?? 1;
  // Validated here too: the descriptor resolves these for its meta, but the
  // factory is public API and may be called directly.
  resolveMockMethods(config.methods);

  const signTypedData: SignCredentialTypedData = (args) =>
    account.signTypedData({
      domain: args.domain,
      types: args.types,
      primaryType: args.primaryType,
      message: args.message,
    } as unknown as Parameters<typeof account.signTypedData>[0]);

  const session: WalletSession = {
    address: account.address,
    chainId,
    signTypedData,
  };

  const controller: WalletController = {
    connect: () => Promise.resolve(session),
    disconnect: () => Promise.resolve(),
    getSession: () => session,
  };

  return { Provider: MockProvider, useController: () => controller };
}
