import type { WalletAdapterDescriptor } from "../types.js";
import {
  privyAdapterMeta,
  resolvePrivyMethods,
  type PHRenownPrivyAdapterConfig,
} from "./meta.js";

/** Privy wallet adapter (embedded wallets plus social / email login) for `RenownWalletProvider`. Importing this module loads no wallet library — `@privy-io/react-auth` is fetched by `load()` on the first login click — but it does make that package a build-time requirement, so install it alongside this import. */
export function privyAdapter(
  config: PHRenownPrivyAdapterConfig,
): WalletAdapterDescriptor {
  return {
    meta: {
      ...privyAdapterMeta,
      supportedMethods: resolvePrivyMethods(config.methods),
    },
    load: () =>
      import("./factory.js").then((m) => m.createPrivyAdapter(config)),
  };
}

export {
  DEFAULT_PRIVY_METHODS,
  privyAdapterMeta,
  resolvePrivyMethods,
} from "./meta.js";
export type { PHRenownPrivyAdapterConfig, PrivyLoginMethod } from "./meta.js";
