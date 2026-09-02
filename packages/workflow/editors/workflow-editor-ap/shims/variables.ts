// Shim for @/features/variables hooks: no project variables.
export const variablesHooks = {
  useVariables(): { data: unknown[]; isLoading: boolean } {
    return { data: [], isLoading: false };
  },
};
