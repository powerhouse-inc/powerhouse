import type {
  WalletAdapterDescriptor,
  WalletController,
} from "@renown/sdk/wallet";

// Module-level registry for the active wallet controller. Connect mounts the
// configured adapter Providers and registers the controller for useRenownAuth.
let activeWalletController: WalletController | undefined;
let controllerWaiters: Array<{
  resolve: (controller: WalletController) => void;
  reject: (error: Error) => void;
}> = [];
let walletActivator: (() => Promise<WalletController>) | undefined;
const activatorListeners = new Set<() => void>();

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
  if (activator === walletActivator) return;
  walletActivator = activator;
  activatorListeners.forEach((listener) => listener());
}

// The provider registers the activator in an effect, after a child hook's first
// effect has run, so a hook that activates on mount must wait for it.
export function subscribeWalletActivator(listener: () => void): () => void {
  activatorListeners.add(listener);
  return () => activatorListeners.delete(listener);
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

// Descriptors the mounted provider snapshotted. A registry rather than context
// because a login UI is not always inside the provider tree (see the controller).
const NO_DESCRIPTORS: readonly WalletAdapterDescriptor[] = Object.freeze([]);

interface DescriptorStore {
  descriptors: readonly WalletAdapterDescriptor[];
  listeners: Set<() => void>;
}

// In the global symbol registry, not a module-level `let`, so duplicate copies
// of this package share one store.
const DESCRIPTOR_STORE = Symbol.for(
  "@powerhousedao/reactor-browser:renown-wallet-descriptors",
);

// Safe on the server: `globalThis` exists there and SSR reads the constant
// below instead, so nothing crosses requests.
function descriptorStore(): DescriptorStore {
  const host = globalThis as unknown as Record<
    symbol,
    DescriptorStore | undefined
  >;
  return (host[DESCRIPTOR_STORE] ??= {
    descriptors: NO_DESCRIPTORS,
    listeners: new Set(),
  });
}

export function setWalletDescriptors(
  descriptors: readonly WalletAdapterDescriptor[] | undefined,
): void {
  const store = descriptorStore();
  const next = descriptors ?? NO_DESCRIPTORS;
  if (next === store.descriptors) return;
  // Copies of this module have distinct empty sentinels; treat them as equal.
  if (next.length === 0 && store.descriptors.length === 0) return;
  store.descriptors = next;
  store.listeners.forEach((listener) => listener());
}

// Identity-stable while unchanged, so useSyncExternalStore does not loop.
export function getWalletDescriptors(): readonly WalletAdapterDescriptor[] {
  return descriptorStore().descriptors;
}

// No provider is mounted during a server render; a constant keeps the hydration
// snapshot stable until the client subscribes.
export function getServerWalletDescriptors(): readonly WalletAdapterDescriptor[] {
  return NO_DESCRIPTORS;
}

export function subscribeWalletDescriptors(listener: () => void): () => void {
  const { listeners } = descriptorStore();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Per-adapter controllers, keyed by meta.id, for hosts that drive one adapter's
// own surface (e.g. Privy's email OTP) rather than the merged controller.
type AdapterControllers = Readonly<Record<string, WalletController>>;

const NO_CONTROLLERS: AdapterControllers = Object.freeze({});

interface ControllerStore {
  controllers: AdapterControllers;
  listeners: Set<() => void>;
}

const CONTROLLER_STORE = Symbol.for(
  "@powerhousedao/reactor-browser:renown-wallet-adapter-controllers",
);

function controllerStore(): ControllerStore {
  const host = globalThis as unknown as Record<
    symbol,
    ControllerStore | undefined
  >;
  return (host[CONTROLLER_STORE] ??= {
    controllers: NO_CONTROLLERS,
    listeners: new Set(),
  });
}

export function setWalletAdapterController(
  id: string,
  controller: WalletController | undefined,
): void {
  const store = controllerStore();
  if (store.controllers[id] === controller) return;
  const next: Record<string, WalletController> = { ...store.controllers };
  if (controller) next[id] = controller;
  else delete next[id];
  store.controllers = Object.freeze(next);
  store.listeners.forEach((listener) => listener());
}

// Identity-stable while unchanged, so useSyncExternalStore does not loop.
export function getWalletAdapterControllers(): AdapterControllers {
  return controllerStore().controllers;
}

export function getServerWalletAdapterControllers(): AdapterControllers {
  return NO_CONTROLLERS;
}

export function subscribeWalletAdapterControllers(
  listener: () => void,
): () => void {
  const { listeners } = controllerStore();
  listeners.add(listener);
  return () => listeners.delete(listener);
}
