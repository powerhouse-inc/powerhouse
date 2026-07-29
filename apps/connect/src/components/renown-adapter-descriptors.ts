import type { PHConnectRenownAdapters } from "@powerhousedao/shared/clis";
import type { WalletAdapterDescriptor } from "@renown/sdk/wallet";
import {
  mockAdapter,
  type MockLoginMethod,
  type PHRenownMockAdapterConfig,
} from "@renown/sdk/wallet/mock";
import { privyAdapter, type PrivyLoginMethod } from "@renown/sdk/wallet/privy";
import { rainbowAdapter, type PHRenownChain } from "@renown/sdk/wallet/rainbow";
import {
  arbitrum,
  base,
  mainnet,
  optimism,
  polygon,
  sepolia,
} from "wagmi/chains";

// `mock` is deliberately absent from the published config schema (TEST/DEV only
// — it signs with a well-known key), so it is read off the runtime config here.
export type ConnectRenownAdapters = PHConnectRenownAdapters & {
  mock?: PHRenownMockAdapterConfig;
};

// Adapters validate `methods` eagerly and throw on one they can't drive. This
// runs during render, so a config typo costs one button, not the whole app.
function describe(
  id: string,
  build: () => WalletAdapterDescriptor,
): WalletAdapterDescriptor[] {
  try {
    return [build()];
  } catch (error) {
    console.error(
      `[connect] Ignoring the "${id}" wallet adapter: connect.renown.adapters.${id} was rejected.`,
      error,
    );
    return [];
  }
}

// `connect.renown.chainId` is an id, but the adapter needs the chain object, so
// only a listed chain can be offered.
const CHAINS_BY_ID = new Map<number, PHRenownChain>(
  [mainnet, sepolia, polygon, optimism, arbitrum, base].map((chain) => [
    chain.id,
    chain,
  ]),
);

// Renown issues on one chain and rejects a session from any other, so the wallet
// UI has to offer that chain and no other.
function chainsFor(
  chainId: number | undefined,
): readonly [PHRenownChain, ...PHRenownChain[]] | undefined {
  if (chainId === undefined) return undefined;
  const chain = CHAINS_BY_ID.get(chainId);
  if (!chain) {
    console.error(
      `[connect] connect.renown.chainId ${chainId} is not a chain Connect can offer, so in-page sign-in will be rejected. Supported: ${[...CHAINS_BY_ID.keys()].join(", ")}.`,
    );
    return undefined;
  }
  return [chain];
}

/** Map Connect's declarative `connect.renown.adapters` config to the descriptors `RenownWalletProvider` takes. Array order sets the order of the login buttons. A rejected adapter config is dropped (logged), leaving the others working. `chainId` is `connect.renown.chainId`, the chain Renown issues credentials on. */
export function configToDescriptors(
  config: ConnectRenownAdapters | undefined,
  chainId?: number,
): WalletAdapterDescriptor[] {
  if (!config) return [];
  const { rainbow, privy, mock } = config;
  const descriptors: WalletAdapterDescriptor[] = [];
  const chains = chainsFor(chainId);
  // Every adapter Connect can offer is imported statically (hence Connect
  // installs all their peers), but each library stays behind a lazy loader.
  if (rainbow) {
    descriptors.push(
      ...describe("rainbow", () =>
        rainbowAdapter({ ...rainbow, ...(chains ? { chains } : {}) })),
    );
  }
  if (privy) {
    // appId is optional in the config schema but required by the adapter: an
    // operator who enables privy without one gets no privy login, not a crash.
    const { appId, clientId, methods } = privy;
    if (appId) {
      descriptors.push(
        ...describe("privy", () =>
          privyAdapter({
            appId,
            clientId,
            // Methods come from JSON, so unvalidated here; the adapter's
            // resolver rejects anything it can't drive.
            methods: methods as PrivyLoginMethod[] | undefined,
          })),
      );
    }
  }
  if (mock) {
    descriptors.push(
      ...describe("mock", () =>
        mockAdapter({
          ...mock,
          methods: mock.methods as MockLoginMethod[] | undefined,
        })),
    );
  }
  return descriptors;
}
