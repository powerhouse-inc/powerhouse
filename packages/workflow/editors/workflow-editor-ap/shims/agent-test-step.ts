// Shim for the agent test-step helpers referenced by run-state.
export function isRunAgent(_step: unknown): boolean {
  return false;
}

export const defaultAgentOutput: unknown = {};
