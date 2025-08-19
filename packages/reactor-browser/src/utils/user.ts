export function getUserPermissions() {
  const user = window.user;
  const allowList = window.phAppConfig?.allowList;
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
