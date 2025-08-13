import { type DocumentDriveDocument } from "document-drive";
import { type ProcessorManager } from "document-drive/processors/processor-manager";
import { type DocumentModelModule, type PHDocument } from "document-model";
import { type VetraPackage } from "../types.js";
import {
  extractDriveIdFromSlug,
  extractDriveSlugFromPath,
  extractNodeIdFromSlug,
} from "../utils/url.js";
import { type Reactor } from "./types.js";

export type SetReactorEvent = CustomEvent<{
  reactor: Reactor | undefined;
}>;
export type ReactorUpdatedEvent = CustomEvent;

export type SetProcessorManagerEvent = CustomEvent<{
  processorManager: ProcessorManager | undefined;
}>;
export type ProcessorManagerUpdatedEvent = CustomEvent;

export type SetDrivesEvent = CustomEvent<{
  drives: DocumentDriveDocument[] | undefined;
}>;
export type DrivesUpdatedEvent = CustomEvent;

export type SetDocumentsEvent = CustomEvent<{
  documents: PHDocument[] | undefined;
}>;
export type DocumentsUpdatedEvent = CustomEvent;

export type SetSelectedDriveIdEvent = CustomEvent<{
  driveSlug: string | undefined;
}>;
export type SelectedDriveIdUpdatedEvent = CustomEvent;

export type SetSelectedNodeIdEvent = CustomEvent<{
  nodeSlug: string | undefined;
}>;
export type SelectedNodeIdUpdatedEvent = CustomEvent;
export type SetVetraPackagesEvent = CustomEvent<{
  vetraPackages: VetraPackage[] | undefined;
}>;
export type VetraPackagesUpdatedEvent = CustomEvent;

export function addPHEventHandlers() {
  addReactorEventHandler();
  addProcessorManagerEventHandler();
  addDrivesEventHandler();
  addDocumentsEventHandler();
  addSelectedDriveIdEventHandler();
  addSelectedNodeIdEventHandler();
  addVetraPackagesEventHandler();
}

export function dispatchSetReactorEvent(reactor: Reactor | undefined) {
  const event = new CustomEvent("ph:setReactor", {
    detail: { reactor },
  });
  window.dispatchEvent(event);
}
export function dispatchReactorUpdatedEvent() {
  const event = new CustomEvent("ph:reactorUpdated");
  window.dispatchEvent(event);
}
export function handleSetReactorEvent(event: SetReactorEvent) {
  const reactor = event.detail.reactor;
  window.reactor = reactor;
  dispatchReactorUpdatedEvent();
}

export function subscribeToReactor(onStoreChange: () => void) {
  window.addEventListener("ph:reactorUpdated", onStoreChange);
  return () => {
    window.removeEventListener("ph:reactorUpdated", onStoreChange);
  };
}

export function addReactorEventHandler() {
  window.addEventListener("ph:setReactor", handleSetReactorEvent);
}

export function dispatchSetProcessorManagerEvent(
  processorManager: ProcessorManager | undefined,
) {
  const event = new CustomEvent("ph:setProcessorManager", {
    detail: { processorManager },
  });
  window.dispatchEvent(event);
}
export function dispatchProcessorManagerUpdatedEvent() {
  const event = new CustomEvent("ph:processorManagerUpdated");
  window.dispatchEvent(event);
}
export function handleSetProcessorManagerEvent(
  event: SetProcessorManagerEvent,
) {
  const processorManager = event.detail.processorManager;
  window.phProcessorManager = processorManager;
  dispatchProcessorManagerUpdatedEvent();
}
export function subscribeToProcessorManager(onStoreChange: () => void) {
  window.addEventListener("ph:processorManagerUpdated", onStoreChange);
  return () => {
    window.removeEventListener("ph:processorManagerUpdated", onStoreChange);
  };
}

export function addProcessorManagerEventHandler() {
  window.addEventListener(
    "ph:setProcessorManager",
    handleSetProcessorManagerEvent,
  );
}

export function dispatchSetDrivesEvent(
  drives: DocumentDriveDocument[] | undefined,
) {
  const event = new CustomEvent("ph:setDrives", {
    detail: { drives },
  });
  window.dispatchEvent(event);
}
export function dispatchDrivesUpdatedEvent() {
  const event = new CustomEvent("ph:drivesUpdated");
  window.dispatchEvent(event);
}
export function handleSetDrivesEvent(event: SetDrivesEvent) {
  const drives = event.detail.drives;
  window.phDrives = drives;
  dispatchDrivesUpdatedEvent();
}

export function subscribeToDrives(onStoreChange: () => void) {
  window.addEventListener("ph:drivesUpdated", onStoreChange);
  return () => {
    window.removeEventListener("ph:drivesUpdated", onStoreChange);
  };
}

export function addDrivesEventHandler() {
  window.addEventListener("ph:setDrives", handleSetDrivesEvent);
}

export function dispatchSetDocumentsEvent(documents: PHDocument[] | undefined) {
  const event = new CustomEvent("ph:setDocuments", {
    detail: { documents },
  });
  window.dispatchEvent(event);
}
export function dispatchDocumentsUpdatedEvent() {
  const event = new CustomEvent("ph:documentsUpdated");
  window.dispatchEvent(event);
}
export function handleSetDocumentsEvent(event: SetDocumentsEvent) {
  const documents = event.detail.documents;
  window.phDocuments = documents;
  dispatchDocumentsUpdatedEvent();
}

export function addDocumentsEventHandler() {
  window.addEventListener("ph:setDocuments", handleSetDocumentsEvent);
}

export function dispatchSetSelectedDriveIdEvent(driveSlug: string | undefined) {
  const event = new CustomEvent("ph:setSelectedDriveId", {
    detail: { driveSlug },
  });
  window.dispatchEvent(event);
}
export function dispatchSelectedDriveIdUpdatedEvent() {
  const event = new CustomEvent("ph:selectedDriveIdUpdated");
  window.dispatchEvent(event);
}

export function handleSetSelectedDriveIdEvent(event: SetSelectedDriveIdEvent) {
  const driveSlug = event.detail.driveSlug;
  const driveId = extractDriveIdFromSlug(driveSlug);
  window.phSelectedDriveId = driveId;
  dispatchSelectedDriveIdUpdatedEvent();
  dispatchSetSelectedNodeIdEvent(undefined);
  if (!driveId) {
    window.history.pushState(null, "", "/");
    return;
  }
  window.history.pushState(null, "", `/d/${driveSlug}`);
}

export function subscribeToSelectedDriveId(onStoreChange: () => void) {
  window.addEventListener("ph:selectedDriveIdUpdated", onStoreChange);
  return () =>
    window.removeEventListener("ph:selectedDriveIdUpdated", onStoreChange);
}

export function addSelectedDriveIdEventHandler() {
  window.addEventListener(
    "ph:setSelectedDriveId",
    handleSetSelectedDriveIdEvent,
  );
}

export function dispatchSetSelectedNodeIdEvent(nodeSlug: string | undefined) {
  const event = new CustomEvent("ph:setSelectedNodeId", {
    detail: { nodeSlug },
  });
  window.dispatchEvent(event);
}
export function dispatchSelectedNodeIdUpdatedEvent() {
  const event = new CustomEvent("ph:selectedNodeIdUpdated");
  window.dispatchEvent(event);
}
export function handleSetSelectedNodeIdEvent(event: SetSelectedNodeIdEvent) {
  const nodeSlug = event.detail.nodeSlug;
  const nodeId = extractNodeIdFromSlug(nodeSlug);
  window.phSelectedNodeId = nodeId;
  dispatchSelectedNodeIdUpdatedEvent();
  const driveSlugFromPath = extractDriveSlugFromPath(window.location.pathname);
  if (!driveSlugFromPath) {
    return;
  }
  if (!nodeSlug) {
    window.history.pushState(null, "", `/d/${driveSlugFromPath}`);
    return;
  }
  window.history.pushState(null, "", `/d/${driveSlugFromPath}/${nodeSlug}`);
}

export function subscribeToSelectedNodeId(onStoreChange: () => void) {
  window.addEventListener("ph:selectedNodeIdUpdated", onStoreChange);
  return () =>
    window.removeEventListener("ph:selectedNodeIdUpdated", onStoreChange);
}

export function addSelectedNodeIdEventHandler() {
  window.addEventListener("ph:setSelectedNodeId", handleSetSelectedNodeIdEvent);
}

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
