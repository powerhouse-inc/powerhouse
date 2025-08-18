import { useSyncExternalStore } from "react";
import {
  subscribeToLoginStatus,
  subscribeToUser,
  subscribeToUserPermissions,
} from "../events/user.js";

export function useUser() {
  const user = useSyncExternalStore(subscribeToUser, () => window.user);
  return user;
}

export function useUserPermissions() {
  const userPermissions = useSyncExternalStore(
    subscribeToUserPermissions,
    () => window.userPermissions,
  );
  return userPermissions;
}

export function useLoginStatus() {
  const loginStatus = useSyncExternalStore(
    subscribeToLoginStatus,
    () => window.loginStatus,
  );
  return loginStatus;
}
