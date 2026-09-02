// Shim for @/hooks/user-hooks.
export const userHooks = {
  getCurrentUserId: (): string | null => "ph-user",
  useCurrentUser: (): { data: null } => ({ data: null }),
};
