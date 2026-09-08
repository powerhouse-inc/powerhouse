import { json } from "@tmpl/core";

export const vscodeSettingsTemplate = json`
{
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true,
  "js/ts.tsdk.path": "node_modules/typescript/lib"
}
`.raw;
