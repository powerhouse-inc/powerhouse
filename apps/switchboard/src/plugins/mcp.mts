import type { HostPlugin } from "@powerhousedao/host-core";
import type { SwitchboardHostContext } from "../plugin-host.mjs";
import { z } from "zod";

/** No entry config: presence is the whole activation. A typo'd config key
 * fails at resolution instead of being silently ignored. */
export const mcpPluginConfigSchema = z.strictObject({});

export type McpPluginConfig = z.input<typeof mcpPluginConfigSchema>;

declare global {
  interface PHPluginConfigs {
    "@powerhousedao/switchboard/plugins/mcp": McpPluginConfig;
  }
}

/**
 * R2.2 — the MCP subsystem as a built-in plugin. PRESENCE IS ACTIVATION —
 * listed means the /mcp endpoint mounts; removed from the composition means
 * it does not exist. Under a declared composition MCP_ENABLED can only switch
 * it off. Without one the default composition lists this plugin exactly when
 * the classic resolution (MCP_ENABLED, the caller's option) leaves MCP on.
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
  configSchema: mcpPluginConfigSchema,
  hooks: {
    // An explicit caller/host `mcp: false` option keeps winning (the same
    // short-circuit resolveMcpEnabled has); an env true has no meaning under
    // a declared composition — presence in the composition is the switch.
    transformServerOptions: (options) =>
      options.mcp === false ? options : { ...options, mcp: true },
  },
};

// resolveHostPlugins consumes the DEFAULT export (plugin object or factory).
export default mcpPlugin;
