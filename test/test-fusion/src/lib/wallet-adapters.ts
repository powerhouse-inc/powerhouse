import type { WalletAdapterDescriptor } from "@renown/sdk/wallet";
import { mockAdapter } from "@renown/sdk/wallet/mock";
import { privyAdapter } from "@renown/sdk/wallet/privy";
import { rainbowAdapter } from "@renown/sdk/wallet/rainbow";

/** Wallet adapters for in-page sign-in; importing one is what makes its peer deps a build requirement, while the wallet library itself still loads lazily on the first login click. Module scope, so RenownWalletProvider snapshots a stable array. NEXT_PUBLIC_RENOWN_MOCK=1 swaps in the headless mock adapter (e2e/dev). */
export const WALLET_ADAPTERS: WalletAdapterDescriptor[] =
  process.env.NEXT_PUBLIC_RENOWN_MOCK === "1"
    ? [mockAdapter({ methods: ["wallet", "google", "email"] })]
    : [
        rainbowAdapter({ ssr: true }),
        privyAdapter({
          appId: "cmruc4ldh02wr0cjxhpdfjbso",
          clientId: "client-WY6bMp7uwaPvuL4wFm5b7Xj7x5wEFhGTLA4k8rwahyZbd",
          methods: ["google", "email"],
        }),
      ];
