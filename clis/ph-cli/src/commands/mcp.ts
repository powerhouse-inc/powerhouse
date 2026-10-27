import { mcpArgs } from "@powerhousedao/shared/clis/args";
import { command } from "cmd-ts";

export const mcp = command({
  name: "mcp",
  args: mcpArgs,
  description: `
Serve the project's reactor-mcp tools to a coding agent over stdio.

Use it as the MCP server command in .mcp.json, .cursor/mcp.json and
.gemini/settings.json. Tools are listed at once, without waiting for Vetra.
The first tool call connects to the project's running Vetra (found through
.ph/vetra-runtime.json), or starts \`ph vetra --strictPort --watch\` in the
background and waits for it to be ready, reporting how the start goes as MCP
progress notifications when the client sent a progressToken, else on stderr.
Startup failures come back as tool errors carrying Vetra's output, which is
also written to .ph/vetra.log.

Beside reactor-mcp's tools it serves restartVetra, which stops the project's
Vetra, starts it again and returns its URLs. When Vetra restarts some other
way (\`ph vetra --restart\`), the next tool call connects to the new one.
`,
  handler: async (args) => {
    if (args.debug) {
      console.error(args);
    }
    const { startMcpLauncher } = await import("../services/mcp.js");
    await startMcpLauncher({
      projectDir: args.projectDir,
      startTimeoutSeconds: args.startTimeout,
    });
  },
});
