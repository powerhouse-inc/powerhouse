// Shim for @/lib/authentication-session: static identity, no AP auth.
const PROJECT_ID = "ph-project";

export const authenticationSession = {
  getProjectId: (): string | null => PROJECT_ID,
  getToken: (): string | null => null,
  getCurrentUserId: (): string | null => "ph-user",
  getPlatformId: (): string | null => "ph-platform",
  isLoggedIn: (): boolean => true,
  appendProjectRoutePrefix: (path: string): string => path,
};
