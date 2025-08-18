import { type User } from "document-model";
import { type LoginStatus, type UserPermissions } from "../types/global.js";
import {
  type SetLoginStatusEvent,
  type SetUserEvent,
  type SetUserPermissionsEvent,
} from "./types.js";

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

export function dispatchSetUserPermissionsEvent(
  userPermissions: UserPermissions | undefined,
) {
  const event = new CustomEvent("ph:setUserPermissions", {
    detail: { userPermissions },
  });
  window.dispatchEvent(event);
}

export function dispatchUserPermissionsUpdatedEvent() {
  const event = new CustomEvent("ph:userPermissionsUpdated");
  window.dispatchEvent(event);
}

export function handleSetUserPermissionsEvent(event: SetUserPermissionsEvent) {
  const userPermissions = event.detail.userPermissions;
  window.userPermissions = userPermissions;
  dispatchUserPermissionsUpdatedEvent();
}

export function subscribeToUserPermissions(onStoreChange: () => void) {
  window.addEventListener("ph:userPermissionsUpdated", onStoreChange);
  return () => {
    window.removeEventListener("ph:userPermissionsUpdated", onStoreChange);
  };
}

export function addUserPermissionsEventHandler() {
  window.addEventListener(
    "ph:setUserPermissions",
    handleSetUserPermissionsEvent,
  );
}
