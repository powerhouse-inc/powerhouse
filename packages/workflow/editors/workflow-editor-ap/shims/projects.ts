// Shim for @/features/projects.
export const projectHooks = {
  useReloadPageIfProjectIdChanged(_projectId: string): void {},
  useCurrentProject(): { data: { id: string; displayName: string } } {
    return { data: { id: "ph-project", displayName: "Powerhouse" } };
  },
};
