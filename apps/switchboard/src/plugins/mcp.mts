import type { HostPlugin } from "@powerhousedao/host-core";
import type { SwitchboardHostContext } from "../plugin-host.mjs";

/**
 * R2.2 — the MCP subsystem as a built-in plugin. Flag-on semantics: PRESENCE
 * IS ACTIVATION — listed (built-in default) means the /mcp endpoint mounts;
 * removed from the composition means it does not exist. The MCP_ENABLED env
 * flag governs the classic/flag-off path only (resolveMcpEnabled, which
 * still runs and whose result this transform overrides flag-on).
 *
 * The mount itself lives inside reactor-api's initializeAndStartAPI (carve
 * map: reactor-api server.ts:1282-1294) and is driven by options.mcp — the
 * plugin's whole job is owning that option.
 */
export const mcpPlugin: HostPlugin<{
  transformServerOptions: (
    options: Record<string, unknown>,
    ctx: SwitchboardHostContext,
  ) => Record<string, unknown>;
}> = {
  name: "switchboard-mcp",
  appliesTo: "switchboard",
  hooks: {
    // An explicit caller/host `mcp: false` option keeps winning (the same
    // short-circuit resolveMcpEnabled has); only the ENV flag loses its
    // meaning flag-on — presence in the composition is the switch.
    transformServerOptions: (options) =>
      options.mcp === false ? options : { ...options, mcp: true },
  },
};

// resolveHostPlugins consumes the DEFAULT export (plugin object or factory).
export default mcpPlugin;
