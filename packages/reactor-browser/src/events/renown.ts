import type { IRenown } from "@renown/sdk";
import type { SetRenownEvent } from "./types.js";
import { dispatchSetUserEvent } from "./user.js";

export function dispatchSetRenownEvent(renown: IRenown | undefined) {
  const event = new CustomEvent("ph:setRenown", {
    detail: { renown },
  });
  window.dispatchEvent(event);
}
export function dispatchRenownUpdatedEvent() {
  const event = new CustomEvent("ph:renownUpdated");
  window.dispatchEvent(event);
}
export function handleSetRenownEvent(event: SetRenownEvent) {
  const renown = event.detail.renown;
  window.renown = renown;
  renown?.on("user", (user) => dispatchSetUserEvent(user));
  dispatchRenownUpdatedEvent();
}

export function subscribeToRenown(onStoreChange: () => void) {
  window.addEventListener("ph:renownUpdated", onStoreChange);
  return () => {
    window.removeEventListener("ph:renownUpdated", onStoreChange);
  };
}

export function addRenownEventHandler() {
  window.addEventListener("ph:setRenown", handleSetRenownEvent);
}
