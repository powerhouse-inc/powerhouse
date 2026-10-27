import { json } from "@tmpl/core";

/** Cursor CLI's project permissions. */
export const cursorCliTemplate = json`
{
  "permissions": {
    "deny": ["Write(document-models/**/gen/**)", "Write(.ph/**)"]
  }
}
`.raw;
