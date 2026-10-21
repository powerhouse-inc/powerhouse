import type { DocumentModelRegistry } from "@powerhousedao/reactor";
import type { DocumentModelLib } from "document-model";
import type {
  IPackageManager,
  IPackagesListener,
} from "../../src/types/vetra.js";

type FakePackageManager = IPackageManager & {
  emit: (packages: DocumentModelLib[]) => void;
};

/**
 * A package manager that holds `packages` and pushes a new snapshot to its
 * subscribers on `emit`, the way an HMR update does.
 */
export function fakePackageManager(
  initial: DocumentModelLib[],
): FakePackageManager {
  const listeners = new Set<IPackagesListener>();
  const manager = {
    registryUrl: null,
    packages: initial,
    addPackage: () => {
      throw new Error("not implemented");
    },
    addPackages: () => [],
    removePackage: () => undefined,
    updateLocalPackage: () => undefined,
    subscribe: (handler: IPackagesListener) => {
      listeners.add(handler);
      return () => listeners.delete(handler);
    },
    getPackageSource: () => null,
    getPackageVersion: () => undefined,
    getRegistryPackages: () => [],
    addLocalPackage: () => undefined,
    load: () => {
      throw new Error("not implemented");
    },
    emit(packages: DocumentModelLib[]) {
      manager.packages = packages;
      for (const listener of listeners) {
        listener({ packages });
      }
    },
  };
  return manager as unknown as FakePackageManager;
}

/**
 * Installs the `window.ph` reactor that `setVetraPackageManager` registers
 * into, and returns a function that restores the previous `window`.
 */
export function stubConnectWindow(registry: DocumentModelRegistry): () => void {
  const global = globalThis as { window?: unknown };
  const previous = global.window;
  global.window = {
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => true,
    ph: {
      reactorClientModule: {
        reactorModule: { documentModelRegistry: registry },
      },
    },
  };
  return () => {
    global.window = previous;
  };
}
