import type { VetraPackage } from "../types/vetra.js";
import { makePHEventFunctions } from "./make-ph-event-functions.js";

const vetraPackageEventFunctions = makePHEventFunctions("vetraPackages");

/** Returns all of the Vetra packages loaded by the Connect instance */
export const useVetraPackages = vetraPackageEventFunctions.useValue;

/** Adds the Vetra packages event handler */
export const addVetraPackagesEventHandler =
  vetraPackageEventFunctions.addEventHandler;

/** Sets the Vetra packages for the Connect instance */
export function setVetraPackages(vetraPackages: VetraPackage[] | undefined) {
  vetraPackageEventFunctions.setValue(vetraPackages);
  const documentModelModules = vetraPackages
    ?.flatMap((pkg) => pkg.modules.documentModelModules)
    .filter((module) => module !== undefined);
  if (documentModelModules) {
    window.ph?.legacyReactor?.setDocumentModelModules(documentModelModules);
  }
}
