import type { PHConnectRenownAdapters } from "@powerhousedao/shared/clis";
import type { WalletAdapterDescriptor } from "@renown/sdk/wallet";
import {
  mockAdapter,
  type MockLoginMethod,
  type PHRenownMockAdapterConfig,
} from "@renown/sdk/wallet/mock";
import { privyAdapter, type PrivyLoginMethod } from "@renown/sdk/wallet/privy";
import { rainbowAdapter } from "@renown/sdk/wallet/rainbow";

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

/** Map Connect's declarative `connect.renown.adapters` config to the descriptors `RenownWalletProvider` takes. Array order sets the order of the login buttons. A rejected adapter config is dropped (logged), leaving the others working. */
export function configToDescriptors(
  config: ConnectRenownAdapters | undefined,
): WalletAdapterDescriptor[] {
  if (!config) return [];
  const { rainbow, privy, mock } = config;
  const descriptors: WalletAdapterDescriptor[] = [];
  // Every adapter Connect can offer is imported statically (hence Connect
  // installs all their peers), but each library stays behind a lazy loader.
  if (rainbow) {
    descriptors.push(...describe("rainbow", () => rainbowAdapter(rainbow)));
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
