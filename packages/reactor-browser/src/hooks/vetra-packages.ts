import {
  DuplicateManifestError,
  DuplicateModuleError,
} from "@powerhousedao/reactor";
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
  updateReactorClientUpgradeManifests(packageManager.packages);
  packageManager.subscribe(({ packages }) => {
    updateReactorClientDocumentModels(packages);
    updateReactorClientUpgradeManifests(packages);
  });
}

function updateReactorClientDocumentModels(packages: DocumentModelLib[]) {
  const documentModelModules = packages.flatMap((pkg) => pkg.documentModels);

  const registry =
    window.ph?.reactorClientModule?.reactorModule?.documentModelRegistry;
  if (!registry || documentModelModules.length === 0) return;

  const results = registry.registerModules(...documentModelModules);
  const duplicates = [];
  for (const result of results) {
    if (result.status === "error") {
      if (DuplicateModuleError.isError(result.error)) {
        duplicates.push(result);
      } else {
        console.error(
          "Failed to register document model module:",
          result.error,
        );
      }
    }
  }
  if (duplicates.length > 0) {
    const duplicateTypes = duplicates.map(
      (r) => r.item.documentModel.global.id,
    );
    registry.unregisterModules(...duplicateTypes);
    registry.registerModules(...duplicates.map((r) => r.item));
  }
}

function updateReactorClientUpgradeManifests(packages: DocumentModelLib[]) {
  const upgradeManifests = packages
    .flatMap((pkg) => pkg.upgradeManifests)
    .filter((u) => u !== undefined);

  const registry =
    window.ph?.reactorClientModule?.reactorModule?.documentModelRegistry;
  if (!registry || upgradeManifests.length === 0) return;

  const results = registry.registerUpgradeManifests(...upgradeManifests);
  const duplicates = [];
  for (const result of results) {
    if (result.status === "error") {
      if (DuplicateManifestError.isError(result.error)) {
        duplicates.push(result);
      } else {
        console.error("Failed to register upgrade manifest:", result.error);
      }
    }
  }
  if (duplicates.length > 0) {
    const duplicateTypes = duplicates
      .map((r) => r.item.documentType)
      .filter((t): t is string => !!t);
    registry.unregisterUpgradeManifests(...duplicateTypes);
    registry.registerUpgradeManifests(...duplicates.map((r) => r.item));
  }
}
