import type { LoginMethod, WalletAdapter, WalletController } from "../types.js";
import { PrivyCore, resolvePrivyMethods } from "./adapter.js";
import { createPrivyProvider } from "./provider.js";

// Config slice for the Privy adapter (mirrors connect.renown.adapters.privy).
// `methods` defaults to [GOOGLE, EMAIL] when omitted.
export interface PHRenownPrivyAdapterConfig {
  appId: string;
  clientId?: string;
  methods?: string[];
}

// Build the Privy WalletAdapter. Provider mounts PrivyProvider + a bridge;
// useController exposes imperative connect/disconnect over the shared core.
export function createPrivyAdapter(
  config: PHRenownPrivyAdapterConfig,
): WalletAdapter {
  const supportedMethods: LoginMethod[] = resolvePrivyMethods(config.methods);
  const core = new PrivyCore(supportedMethods);
  const Provider = createPrivyProvider(core, {
    appId: config.appId,
    clientId: config.clientId,
  });

  function useController(): WalletController {
    return {
      connect: (method) => core.connect(method),
      disconnect: () => core.disconnect(),
      getSession: () => core.getSession(),
      supportedMethods,
    };
  }

  return {
    id: "privy",
    supportedMethods,
    Provider,
    useController,
  };
}

export { PrivyCore, resolvePrivyMethods } from "./adapter.js";
export type { PrivyBindings } from "./adapter.js";
export { PrivyAdapterBridge } from "./bridge.js";
export { createPrivyProvider } from "./provider.js";
