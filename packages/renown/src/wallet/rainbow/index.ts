import type { WalletAdapterDescriptor } from "../types.js";
import {
  rainbowAdapterMeta,
  type PHRenownRainbowAdapterConfig,
} from "./meta.js";

/** RainbowKit + wagmi wallet adapter (external / injected wallets) for `RenownWalletProvider`. Importing this module loads no wallet library — `@rainbow-me/rainbowkit`, `wagmi` and `@tanstack/react-query` are fetched by `load()` on the first login click — but it does make them build-time requirements, so install them alongside this import. Pass `ssr: true` on server-rendered hosts. */
export function rainbowAdapter(
  config: PHRenownRainbowAdapterConfig,
): WalletAdapterDescriptor {
  return {
    meta: rainbowAdapterMeta,
    load: () =>
      import("./factory.js").then((m) => m.createRainbowAdapter(config)),
  };
}

export { RAINBOW_METHODS, rainbowAdapterMeta } from "./meta.js";
export type { PHRenownRainbowAdapterConfig } from "./meta.js";
