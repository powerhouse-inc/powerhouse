export function getUserPermissions() {
  const user = window.ph?.user;
  const allowList = window.ph?.allowList;
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
