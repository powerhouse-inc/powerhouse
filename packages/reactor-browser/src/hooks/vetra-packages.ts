import { DuplicateModuleError } from "@powerhousedao/reactor";
import type { DocumentModelLib } from "document-model";
import { useSyncExternalStore } from "react";
import type { IPackageManager } from "../types/vetra.js";
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

function updateReactorClientDocumentModels(packages: DocumentModelLib[]) {
  const documentModelModules = packages.flatMap((pkg) => pkg.documentModels);

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
