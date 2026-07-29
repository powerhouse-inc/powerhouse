import type { WalletAdapterDescriptor } from "@renown/sdk/wallet";
import { mockAdapter } from "@renown/sdk/wallet/mock";
import { privyAdapter } from "@renown/sdk/wallet/privy";
import { rainbowAdapter } from "@renown/sdk/wallet/rainbow";
import { RENOWN_APP_NAME } from "./renown";

// Unlike the rainbow ids, Privy's app id has no degraded mode: the adapter
// can't initialise without one, so it is left out entirely when unset.
const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

/** Wallet adapters for in-page sign-in; importing one is what makes its peer deps a build requirement, while the wallet library itself still loads lazily on the first login click. Module scope, so RenownWalletProvider snapshots a stable array. NEXT_PUBLIC_RENOWN_MOCK=1 swaps in the headless mock adapter (e2e/dev). */
export const WALLET_ADAPTERS: WalletAdapterDescriptor[] =
  process.env.NEXT_PUBLIC_RENOWN_MOCK === "1"
    ? [mockAdapter({ methods: ["wallet", "google", "email"] })]
    : [
        rainbowAdapter({
          ssr: true,
          appName: RENOWN_APP_NAME,
          // Both optional (see .env.local.example): without the WalletConnect id
          // only an installed wallet can sign in, without Infura chains use public RPCs.
          walletConnectProjectId:
            process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
          infuraProjectId: process.env.NEXT_PUBLIC_INFURA_PROJECT_ID,
        }),
        ...(PRIVY_APP_ID
          ? [
              privyAdapter({
                appId: PRIVY_APP_ID,
                clientId: process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID,
                methods: ["google", "email"],
              }),
            ]
          : []),
      ];
