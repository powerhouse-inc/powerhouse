import { privateKeyToAccount } from "viem/accounts";
import type { ComponentType, ReactNode } from "react";
import type { SignCredentialTypedData } from "../../credential.js";
import {
  DEFAULT_MOCK_METHODS,
  LoginMethod,
  type WalletAdapter,
  type WalletController,
  type WalletSession,
} from "../types.js";

type Hex = `0x${string}`;

// Well-known Anvil/Hardhat test account #0 private key. Default so tests need no
// key; every connect resolves to its deterministic address.
const DEFAULT_TEST_KEY: Hex =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

/** Config for the mock wallet adapter. TEST/DEV ONLY — signs with a local key; never enable in production. */
export interface PHRenownMockAdapterConfig {
  /** Signing key; defaults to the well-known Anvil test account #0. */
  privateKey?: Hex;
  /** Chain id reported in the session (default 1). */
  chainId?: number;
  /** Methods this adapter answers for; defaults to wallet + google + email. */
  methods?: string[];
}

const MockProvider: ComponentType<{ children: ReactNode }> = (props) =>
  props.children;

/** Headless test/dev wallet adapter: `connect()` resolves immediately with a session backed by a viem local account (real EIP-712 signatures, no wallet UI or OAuth). Enable via `adapters.mock` to e2e-test sign-in deterministically. See the reactor-browser README "Testing" and the Academy Renown auth guide. */
export function createMockAdapter(
  config: PHRenownMockAdapterConfig,
): WalletAdapter {
  const account = privateKeyToAccount(config.privateKey ?? DEFAULT_TEST_KEY);
  const chainId = config.chainId ?? 1;
  const supportedMethods = config.methods?.length
    ? (config.methods as LoginMethod[])
    : DEFAULT_MOCK_METHODS;

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
    supportedMethods,
    connect: () => Promise.resolve(session),
    disconnect: () => Promise.resolve(),
    getSession: () => session,
  };

  return {
    id: "mock",
    supportedMethods,
    Provider: MockProvider,
    useController: () => controller,
  };
}
