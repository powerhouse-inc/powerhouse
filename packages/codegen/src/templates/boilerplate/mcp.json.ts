import { json } from "@tmpl/core";

export const mcpTemplate = json`
{
  "mcpServers": {
    "reactor-mcp": {
      "type": "http",
      "url": "http://localhost:4001/mcp"
    }
  }
}
`.raw;
