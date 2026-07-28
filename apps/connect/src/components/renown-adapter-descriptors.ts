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

/** Map Connect's declarative `connect.renown.adapters` config to the descriptors `RenownWalletProvider` takes. Array order sets the order of the login buttons. */
export function configToDescriptors(
  config: ConnectRenownAdapters | undefined,
): WalletAdapterDescriptor[] {
  if (!config) return [];
  const descriptors: WalletAdapterDescriptor[] = [];
  // Every adapter Connect can offer is imported statically (hence Connect
  // installs all their peers), but each library stays behind a lazy loader.
  if (config.rainbow) descriptors.push(rainbowAdapter(config.rainbow));
  if (config.privy) {
    // appId is optional in the config schema but required by the adapter: an
    // operator who enables privy without one gets no privy login, not a crash.
    const { appId, clientId, methods } = config.privy;
    if (appId) {
      descriptors.push(
        // Methods come from JSON, so they are unvalidated here; the adapter's
        // resolver rejects anything it can't drive.
        privyAdapter({
          appId,
          clientId,
          methods: methods as PrivyLoginMethod[] | undefined,
        }),
      );
    }
  }
  if (config.mock) {
    descriptors.push(
      mockAdapter({
        ...config.mock,
        methods: config.mock.methods as MockLoginMethod[] | undefined,
      }),
    );
  }
  return descriptors;
}
