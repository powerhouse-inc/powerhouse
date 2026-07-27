import type { WalletController } from "@renown/sdk/wallet";

// Module-level registry for the active wallet controller. Connect mounts the
// configured adapter Providers and registers the controller for useRenownAuth.
let activeWalletController: WalletController | undefined;
let controllerWaiters: Array<{
  resolve: (controller: WalletController) => void;
  reject: (error: Error) => void;
}> = [];
let walletActivator: (() => Promise<WalletController>) | undefined;

export function setActiveWalletController(
  controller: WalletController | undefined,
): void {
  activeWalletController = controller;
  if (controller) {
    const waiters = controllerWaiters;
    controllerWaiters = [];
    waiters.forEach(({ resolve }) => resolve(controller));
  }
}

// Called when activation can't produce a controller (e.g. no adapter loaded
// because a peer dep is missing) so a pending login() rejects instead of hanging.
export function failWalletActivation(error: Error): void {
  const waiters = controllerWaiters;
  controllerWaiters = [];
  waiters.forEach(({ reject }) => reject(error));
}

export function getActiveWalletController(): WalletController | undefined {
  return activeWalletController;
}

// Registered by the app's wallet-provider mount. Lets login() mount the adapter
// Providers on demand (on click) instead of loading wallet libraries at startup.
export function setWalletActivator(
  activator: (() => Promise<WalletController>) | undefined,
): void {
  walletActivator = activator;
}

export function getWalletActivator():
  | (() => Promise<WalletController>)
  | undefined {
  return walletActivator;
}

// Resolves once a wallet controller is registered (after on-demand mount), or
// rejects if activation fails (see failWalletActivation).
export function whenWalletControllerReady(): Promise<WalletController> {
  if (activeWalletController) return Promise.resolve(activeWalletController);
  return new Promise((resolve, reject) =>
    controllerWaiters.push({ resolve, reject }),
  );
}
