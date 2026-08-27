import type { WalletController } from "@renown/sdk/wallet";
import { logger } from "document-model";
import { useEffect, useSyncExternalStore } from "react";
import {
  getServerWalletAdapterControllers,
  getWalletActivator,
  getWalletAdapterControllers,
  subscribeWalletActivator,
  subscribeWalletAdapterControllers,
} from "./wallet-registry.js";

/** The controller of one adapter mounted by {@link RenownWalletProvider}, by its `meta.id`, typed as that adapter's own surface — e.g. `useRenownWalletAdapter<PrivyWalletController>("privy")` for headless email OTP. Rendering it activates the wallet tree (the adapter's library loads then), so call it from the sign-in screen, not the app shell. `undefined` until the adapter is mounted, or forever when no provider offers that id. */
export function useRenownWalletAdapter<
  T extends WalletController = WalletController,
>(id: string): T | undefined {
  const controllers = useSyncExternalStore(
    subscribeWalletAdapterControllers,
    getWalletAdapterControllers,
    getServerWalletAdapterControllers,
  );
  const controller = controllers[id] as T | undefined;
  // Re-render when the provider registers its activator (it does so in an
  // effect, after this hook's first effect).
  const activator = useSyncExternalStore(
    subscribeWalletActivator,
    getWalletActivator,
    () => undefined,
  );
  const hasActivator = activator !== undefined;

  useEffect(() => {
    if (controller || !hasActivator) return;
    const current = getWalletActivator();
    if (!current) return;
    // Rejections (no adapter loaded) are reported by the provider; the hook
    // only needs to keep them from surfacing as unhandled.
    void current().catch((error: unknown) =>
      logger.error(error instanceof Error ? error.message : String(error)),
    );
  }, [controller, hasActivator, id]);

  return controller;
}
