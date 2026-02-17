import { DuplicateModuleError } from "@powerhousedao/reactor";
import { useSyncExternalStore } from "react";
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

/** Adds the Vetra packages event handler */
export const addVetraPackageManagerEventHandler =
  vetraPackageManagerFunctions.addEventHandler;

/** Sets the Vetra packages for the Connect instance */
export function setVetraPackageManager(packageManager: IPackageManager) {
  vetraPackageManagerFunctions.setValue(packageManager);
  try {
    updateReactorClientDocumentModels(packageManager.packages);
  } catch (error) {
    console.error(error);
  }
  packageManager.subscribe(({ packages }) => {
    updateReactorClientDocumentModels(packages);
  });
}

function updateReactorClientDocumentModels(packages: VetraPackage[]) {
  const documentModelModules = packages
    .flatMap((pkg) => pkg.modules.documentModelModules)
    .filter((module) => module !== undefined);
  if (documentModelModules.length > 0) {
    try {
      window.ph?.reactorClientModule?.reactorModule?.documentModelRegistry.registerModules(
        ...documentModelModules,
      );
    } catch (error) {
      // check if it's a duplicate module error
      if (error instanceof DuplicateModuleError) {
        return;
      }
      throw error;
    }
  }
}
