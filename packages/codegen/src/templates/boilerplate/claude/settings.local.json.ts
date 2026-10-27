import { json } from "@tmpl/core";

export const claudeSettingsLocalTemplate = json`
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "enableAllProjectMcpServers": true,
  "enabledMcpjsonServers": ["reactor-mcp"]
}
`.raw;

/** Rules earlier templates wrote to settings.local.json; they now live in
 * settings.json. */
export const obsoleteClaudeSettingsLocalRules = {
  allow: ["Bash(npm run tsc:*)", "Bash(npm run lint:*)"],
  deny: [
    "Write(./document-models/**/gen/**)",
    "Write(./.ph/**)",
    "Edit(./document-models/**/gen/**)",
    "Edit(./.ph/**)",
  ],
};
