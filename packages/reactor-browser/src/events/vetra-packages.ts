import type { DocumentModelModule } from "document-model";
import type { VetraPackage } from "../types/vetra.js";
import type { SetVetraPackagesEvent } from "./types.js";

export function dispatchSetVetraPackagesEvent(
  vetraPackages: VetraPackage[] | undefined,
) {
  const event = new CustomEvent("ph:setVetraPackages", {
    detail: { vetraPackages },
  });
  window.dispatchEvent(event);
}
export function dispatchVetraPackagesUpdatedEvent() {
  const event = new CustomEvent("ph:vetraPackagesUpdated");
  window.dispatchEvent(event);
}
export function handleSetVetraPackagesEvent(event: SetVetraPackagesEvent) {
  const vetraPackages = event.detail.vetraPackages;
  window.vetraPackages = vetraPackages;
  dispatchVetraPackagesUpdatedEvent();
  const documentModelModules = vetraPackages
    ?.flatMap((pkg) => pkg.modules.documentModelModules)
    .filter((module) => module !== undefined);
  window.reactor?.setDocumentModelModules(
    documentModelModules as DocumentModelModule[],
  );
}

export function subscribeToVetraPackages(onStoreChange: () => void) {
  window.addEventListener("ph:vetraPackagesUpdated", onStoreChange);
  return () => {
    window.removeEventListener("ph:vetraPackagesUpdated", onStoreChange);
  };
}

export function addVetraPackagesEventHandler() {
  window.addEventListener("ph:setVetraPackages", handleSetVetraPackagesEvent);
}
