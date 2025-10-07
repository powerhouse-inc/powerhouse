import { dispatchSetSelectedNodeIdEvent } from "./nodes.js";
import type { SetSelectedDriveIdEvent } from "./types.js";

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
