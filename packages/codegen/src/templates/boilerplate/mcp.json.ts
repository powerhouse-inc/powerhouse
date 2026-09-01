import { DEFAULT_SWITCHBOARD_PORT } from "@powerhousedao/shared/clis/constants";
import { json } from "@tmpl/core";

/**
 * Render `.mcp.json` for a project whose switchboard listens on `port`.
 *
 * The port is a literal rather than an env reference on purpose: an MCP
 * client resolves this file at session start and cannot read `.env` or
 * `powerhouse.config.json`. `ph vetra` reconciles the literal if an override
 * moves the port.
 */
export const buildMcpTemplate = (port: number) => json`
{
  "mcpServers": {
    "reactor-mcp": {
      "type": "http",
      "url": "http://localhost:${String(port)}/mcp"
    }
  }
}
`.raw;

export const mcpTemplate = buildMcpTemplate(DEFAULT_SWITCHBOARD_PORT);
