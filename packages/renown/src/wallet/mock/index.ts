import type { WalletAdapterDescriptor } from "../types.js";
import {
  mockAdapterMeta,
  resolveMockMethods,
  type PHRenownMockAdapterConfig,
} from "./meta.js";

/** Headless test/dev wallet adapter for `RenownWalletProvider`: signs real EIP-712 credentials with a local viem account, no wallet UI or OAuth, so e2e sign-in is deterministic. **TEST/DEV ONLY; never enable in production** — it signs with a known key. Needs only `viem`, which `@renown/sdk` already depends on. */
export function mockAdapter(
  config: PHRenownMockAdapterConfig,
): WalletAdapterDescriptor {
  return {
    meta: {
      ...mockAdapterMeta,
      supportedMethods: resolveMockMethods(config.methods),
    },
    load: () => import("./factory.js").then((m) => m.createMockAdapter(config)),
  };
}

export {
  DEFAULT_MOCK_METHODS,
  mockAdapterMeta,
  resolveMockMethods,
} from "./meta.js";
export type { MockLoginMethod, PHRenownMockAdapterConfig } from "./meta.js";
