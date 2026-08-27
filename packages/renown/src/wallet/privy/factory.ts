// Renders React (PrivyProvider + hooks), so RSC hosts must treat this as a
// client module even though the descriptor entry reaches it lazily.
"use client";

import { useMemo } from "react";
import type { WalletAdapterImpl } from "../types.js";
import { PrivyCore } from "./adapter.js";
import type { PrivyWalletController } from "./types.js";
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
    chain: config.chain,
  });

  // Stable identity: the host publishes this to a registry on change.
  function useController(): PrivyWalletController {
    return useMemo<PrivyWalletController>(
      () => ({
        connect: (method) => core.connect(method),
        disconnect: () => core.disconnect(),
        getSession: () => core.getSession(),
        subscribe: (listener) => core.subscribe(listener),
        sendCode: (email, options) => core.sendCode(email, options),
        loginWithCode: (code) => core.loginWithCode(code),
        getState: () => core.getState(),
        subscribeState: (listener) => core.subscribeState(listener),
      }),
      [],
    );
  }

  return { Provider, useController };
}

export { PrivyCore } from "./adapter.js";
export type { PrivyBindings } from "./adapter.js";
export type {
  PrivyAuthState,
  PrivyEmailStatus,
  PrivyWalletController,
  SendCodeOptions,
} from "./types.js";
export { PrivyAdapterBridge } from "./bridge.js";
export { createPrivyProvider } from "./provider.js";
