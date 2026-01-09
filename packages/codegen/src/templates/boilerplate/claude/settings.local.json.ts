import { json } from "@tmpl/core";

export const claudeSettingsLocalTemplate = json`
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "permissions": {
    "allow": ["Bash(npm run tsc:*)", "Bash(npm run lint:*)"],
    "deny": [
      "Write(./document-models/*/gen/**)",
      "Write(./.ph/**)",
      "Edit(./document-models/*/gen/**)",
      "Edit(./.ph/**)"
    ]
  },
  "enableAllProjectMcpServers": true,
  "enabledMcpjsonServers": ["reactor-mcp"]
}
`.raw;
