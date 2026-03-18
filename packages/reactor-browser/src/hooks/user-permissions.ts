import { useAllowList } from "./connect.js";
import { useUser } from "./renown.js";
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
