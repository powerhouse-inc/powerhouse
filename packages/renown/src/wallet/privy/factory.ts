// Renders React (PrivyProvider + hooks), so RSC hosts must treat this as a
// client module even though the descriptor entry reaches it lazily.
"use client";

import type { WalletAdapterImpl, WalletController } from "../types.js";
import { PrivyCore } from "./adapter.js";
import {
  resolvePrivyMethods,
  type PHRenownPrivyAdapterConfig,
} from "./meta.js";
import { createPrivyProvider } from "./provider.js";

// Build the Privy adapter. Provider mounts PrivyProvider + a bridge;
// useController exposes imperative connect/disconnect over the shared core.
export function createPrivyAdapter(
  config: PHRenownPrivyAdapterConfig,
): WalletAdapterImpl {
  const core = new PrivyCore(resolvePrivyMethods(config.methods));
  const Provider = createPrivyProvider(core, {
    appId: config.appId,
    clientId: config.clientId,
  });

  function useController(): WalletController {
    return {
      connect: (method) => core.connect(method),
      disconnect: () => core.disconnect(),
      getSession: () => core.getSession(),
      subscribe: (listener) => core.subscribe(listener),
    };
  }

  return { Provider, useController };
}

export { PrivyCore } from "./adapter.js";
export type { PrivyBindings } from "./adapter.js";
export { PrivyAdapterBridge } from "./bridge.js";
export { createPrivyProvider } from "./provider.js";
