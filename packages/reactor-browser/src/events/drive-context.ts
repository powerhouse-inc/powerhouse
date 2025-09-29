import type { IDriveContext } from "../types/drive-editor.js";
import type { SetDriveContextEvent } from "./types.js";

export function dispatchSetDriveContextEvent(
  driveContext: IDriveContext | undefined,
) {
  const event = new CustomEvent("ph:setDriveContext", {
    detail: { driveContext },
  });
  window.dispatchEvent(event);
}

export function dispatchDriveContextUpdatedEvent() {
  const event = new CustomEvent("ph:driveContextUpdated");
  window.dispatchEvent(event);
}

export function handleSetDriveContextEvent(event: SetDriveContextEvent) {
  const driveContext = event.detail.driveContext;
  window.phDriveContext = driveContext;
  dispatchDriveContextUpdatedEvent();
}

export function subscribeToDriveContext(onStoreChange: () => void) {
  window.addEventListener("ph:driveContextUpdated", onStoreChange);
  return () => {
    window.removeEventListener("ph:driveContextUpdated", onStoreChange);
  };
}

export function addDriveContextEventHandler() {
  window.addEventListener("ph:setDriveContext", handleSetDriveContextEvent);
}