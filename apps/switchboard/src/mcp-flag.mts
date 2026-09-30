import type { BooleanFlagSource } from "./workflow-runtime.mjs";

/** The env var and OpenFeature flag key that can keep the MCP server unmounted. */
export const MCP_ENABLED = "MCP_ENABLED";

export interface McpFlagInput {
  featureFlags: BooleanFlagSource;
  /** The host's `mcp` option. */
  option?: boolean;
}

/** Whether to mount the MCP server at `/mcp`. On unless the host passes
 * `mcp: false` or MCP_ENABLED is "false": the env var can turn a host's MCP
 * off, never on, so a deployment that serves no MCP client can close the
 * endpoint without the bin growing a flag of its own. */
export async function resolveMcpEnabled({
  featureFlags,
  option,
}: McpFlagInput): Promise<boolean> {
  if (option === false) return false;
  return featureFlags.getBooleanValue(MCP_ENABLED, true);
}
