// Shim for @/hooks/authorization-hooks: the document editor has no AP roles.
export function useAuthorization(): {
  checkAccess: (permission: unknown) => boolean;
} {
  return { checkAccess: () => true };
}

export function useShowPlatformAdminDashboard(): boolean {
  return false;
}
