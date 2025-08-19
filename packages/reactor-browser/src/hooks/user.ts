import { useSyncExternalStore } from "react";
import { subscribeToLoginStatus, subscribeToUser } from "../events/user.js";
import { useAllowList } from "./config.js";

export function useUser() {
  const user = useSyncExternalStore(subscribeToUser, () => window.user);
  return user;
}

export function useUserPermissions() {
  const user = useUser();
  const allowList = useAllowList();
  if (!allowList) {
    return {
      isAllowedToCreateDocuments: true,
      isAllowedToEditDocuments: true,
    };
  }

  return {
    isAllowedToCreateDocuments: allowList.includes(user?.address ?? ""),
    isAllowedToEditDocuments: allowList.includes(user?.address ?? ""),
  };
}

export function useLoginStatus() {
  const loginStatus = useSyncExternalStore(
    subscribeToLoginStatus,
    () => window.loginStatus,
  );
  return loginStatus;
}
