import { type User } from "document-model";
import { type LoginStatus } from "../types/global.js";
import { type SetLoginStatusEvent, type SetUserEvent } from "./types.js";

export function dispatchSetLoginStatusEvent(
  loginStatus: LoginStatus | undefined,
) {
  const event = new CustomEvent("ph:setLoginStatus", {
    detail: { loginStatus },
  });
  window.dispatchEvent(event);
}

export function dispatchLoginStatusUpdatedEvent() {
  const event = new CustomEvent("ph:loginStatusUpdated");
  window.dispatchEvent(event);
}

export function handleSetLoginStatusEvent(event: SetLoginStatusEvent) {
  const loginStatus = event.detail.loginStatus;
  window.loginStatus = loginStatus;
  dispatchLoginStatusUpdatedEvent();
}

export function subscribeToLoginStatus(onStoreChange: () => void) {
  window.addEventListener("ph:loginStatusUpdated", onStoreChange);
  return () => {
    window.removeEventListener("ph:loginStatusUpdated", onStoreChange);
  };
}

export function addLoginStatusEventHandler() {
  window.addEventListener("ph:setLoginStatus", handleSetLoginStatusEvent);
}

export function dispatchSetUserEvent(user: User | undefined) {
  console.log("dispatchSetUserEvent", user);
  const event = new CustomEvent("ph:setUser", {
    detail: { user },
  });
  window.dispatchEvent(event);
}
export function dispatchUserUpdatedEvent() {
  const event = new CustomEvent("ph:userUpdated");
  window.dispatchEvent(event);
}
export function handleSetUserEvent(event: SetUserEvent) {
  const user = event.detail.user;
  window.user = user;
  dispatchUserUpdatedEvent();
}

export function subscribeToUser(onStoreChange: () => void) {
  window.addEventListener("ph:userUpdated", onStoreChange);
  return () => {
    window.removeEventListener("ph:userUpdated", onStoreChange);
  };
}

export function addUserEventHandler() {
  window.addEventListener("ph:setUser", handleSetUserEvent);
}
