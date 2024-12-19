export type UserPermissions = {
  isAllowedToCreateDocuments: boolean;
  isAllowedToEditDocuments: boolean;
};

export function useUserPermissions(): UserPermissions | undefined {
  return {
    isAllowedToCreateDocuments: true,
    isAllowedToEditDocuments: true,
  };
}
