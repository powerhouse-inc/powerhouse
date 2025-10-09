import type { DocumentDriveDocument } from "document-drive";
import { resolveUrlPathname } from "../utils/url.js";
import { dispatchSetSelectedNodeIdEvent } from "./nodes.js";
import type { SetDrivesEvent, SetSelectedDriveIdEvent } from "./types.js";

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
  // Find the drive by slug to get its actual ID
  const drive = window.phDrives?.find((d) => d.header.slug === driveSlug);
  const driveId = drive?.header.id;

  window.phSelectedDriveId = driveId;
  dispatchSelectedDriveIdUpdatedEvent();
  dispatchSetSelectedNodeIdEvent(undefined);
  if (!driveId) {
    window.history.pushState(null, "", resolveUrlPathname("/"));
    return;
  }
  window.history.pushState(null, "", resolveUrlPathname(`/d/${driveSlug}`));
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
