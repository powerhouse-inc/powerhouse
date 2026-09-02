// Shim for @/features/platform-admin: no AI providers configured.
export const aiProviderQueries = {
  useProjectAiProviders(): { data: unknown[] } {
    return { data: [] };
  },
};
