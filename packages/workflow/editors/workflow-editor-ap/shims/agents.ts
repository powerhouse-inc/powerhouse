// Shim for @/features/agents.
export const agentHooks = {
  useList(): { data: { data: unknown[] } } {
    return { data: { data: [] } };
  },
};
