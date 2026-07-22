import type { WalletAdaptersConfig } from "@renown/sdk/wallet";

// Renown config, mirrored from versioned-documents/powerhouse.config.json.
export const RENOWN_APP_NAME = "test-fusion";

// When set, sign-in happens in-page (no redirect to the Renown portal).
// NEXT_PUBLIC_SWITCHBOARD_URL points at a local switchboard for e2e/dev.
export const SWITCHBOARD_URL =
  process.env.NEXT_PUBLIC_SWITCHBOARD_URL ??
  "https://switchboard.renown.vetra.io/graphql";

// Wallet adapters for in-page sign-in; lazy-loaded on first login click.
// NEXT_PUBLIC_RENOWN_MOCK=1 swaps in the headless mock adapter (e2e/dev).
export const WALLET_ADAPTERS: WalletAdaptersConfig =
  process.env.NEXT_PUBLIC_RENOWN_MOCK === "1"
    ? { mock: { methods: ["wallet", "google", "email"] } }
    : {
        rainbow: { walletConnectProjectId: "" },
        privy: {
          appId: "cmruc4ldh02wr0cjxhpdfjbso",
          clientId: "client-WY6bMp7uwaPvuL4wFm5b7Xj7x5wEFhGTLA4k8rwahyZbd",
          methods: ["google", "email"],
        },
      };
