import { DuplicateModuleError } from "@powerhousedao/reactor";
import { useSyncExternalStore } from "react";
import type {
  BrowserPackageManager,
  DismissedPackage,
  PendingInstallation,
} from "../package-manager.js";
import type { IPackageManager, VetraPackage } from "../types/vetra.js";
import { makePHEventFunctions } from "./make-ph-event-functions.js";

const vetraPackageManagerFunctions = makePHEventFunctions(
  "vetraPackageManager",
);

export const useVetraPackageManager = vetraPackageManagerFunctions.useValue;

/** Returns all of the Vetra packages loaded by the Connect instance */
export const useVetraPackages = () => {
  const packageManager = useVetraPackageManager();

  return useSyncExternalStore(
    (cb) => (packageManager ? packageManager.subscribe(cb) : () => {}),
    () => packageManager?.packages ?? [],
  );
};

/** Adds the Vetra package manager event handler */
export const addVetraPackageManagerEventHandler =
  vetraPackageManagerFunctions.addEventHandler;

/** Sets the Vetra package manager and registers its packages */
export function setVetraPackageManager(packageManager: IPackageManager) {
  vetraPackageManagerFunctions.setValue(packageManager);
  updateReactorClientDocumentModels(packageManager.packages);
  packageManager.subscribe(({ packages }) => {
    updateReactorClientDocumentModels(packages);
  });
}

const EMPTY_PENDING: PendingInstallation[] = [];
const EMPTY_DISMISSED: DismissedPackage[] = [];
const NOOP_UNSUBSCRIBE = () => {};

export function usePendingInstallations(): PendingInstallation[] {
  const pm = useVetraPackageManager() as BrowserPackageManager | undefined;

  return useSyncExternalStore(
    (cb) => (pm ? pm.subscribePendingChanges(cb) : NOOP_UNSUBSCRIBE),
    () => pm?.getPendingInstallations() ?? EMPTY_PENDING,
  );
}

export function useDismissedPackages(): DismissedPackage[] {
  const pm = useVetraPackageManager() as BrowserPackageManager | undefined;

  return useSyncExternalStore(
    (cb) => (pm ? pm.subscribePendingChanges(cb) : NOOP_UNSUBSCRIBE),
    () => pm?.getDismissedPackages() ?? EMPTY_DISMISSED,
  );
}

function updateReactorClientDocumentModels(packages: VetraPackage[]) {
  const documentModelModules = packages
    .flatMap((pkg) => pkg.modules.documentModelModules)
    .filter((module) => module !== undefined);

  const registry =
    window.ph?.reactorClientModule?.reactorModule?.documentModelRegistry;
  if (!registry || documentModelModules.length === 0) return;

  for (const module of documentModelModules) {
    try {
      registry.registerModules(module);
    } catch (error) {
      if (DuplicateModuleError.isError(error)) {
        continue;
      }
      throw error;
    }
  }
}
