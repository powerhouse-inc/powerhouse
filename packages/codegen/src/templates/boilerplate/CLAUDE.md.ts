import { md } from "@tmpl/core";

/** Claude Code reads CLAUDE.md, not AGENTS.md, so it imports AGENTS.md. */
export const claudeTemplate = md`
@AGENTS.md

## Claude Code

- reactor-mcp tools are named \`mcp__reactor-mcp__<tool>\`.
`.raw;
