import { json } from "@tmpl/core";

/** Team rules, committed. `Edit` rules cover every file-writing tool; a
 * leading `/` anchors to the project root. */
export const claudeSettingsTemplate = json`
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "permissions": {
    "allow": ["Bash(npm run tsc:*)", "Bash(npm run lint:*)"],
    "deny": ["Edit(/document-models/**/gen/**)", "Edit(/.ph/**)"]
  }
}
`.raw;
