import { DEFAULT_SWITCHBOARD_PORT } from "@powerhousedao/shared/clis/constants";
import { json } from "@tmpl/core";

/** Cursor's copy of the MCP config. Same literal-port reasoning as `.mcp.json`. */
export const buildCursorMcpTemplate = (port: number) => json`
{
  "mcpServers": {
    "reactor-mcp": {
      "type": "http",
      "url": "http://localhost:${String(port)}/mcp"
    }
  }
}
`.raw;

export const cursorMcpTemplate = buildCursorMcpTemplate(
  DEFAULT_SWITCHBOARD_PORT,
);
