import { getPHStore } from "../hooks/ph-store.js";
export function getUserPermissions() {
  const user = getPHStore()?.renown?.user;
  const allowList = getPHStore()?.allowList;
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
