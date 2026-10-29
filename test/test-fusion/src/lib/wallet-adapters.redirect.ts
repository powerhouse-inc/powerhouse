import type { WalletAdapterDescriptor } from "@renown/sdk/wallet";

/** Redirect mode's stand-in for ./wallet-adapters, swapped in by next.config.ts
 * so a redirect build imports no wallet library. Undefined, not `[]`: an empty
 * array still registers the in-page login activator, which suppresses the
 * redirect to the Renown portal. */
export const WALLET_ADAPTERS: WalletAdapterDescriptor[] | undefined = undefined;
