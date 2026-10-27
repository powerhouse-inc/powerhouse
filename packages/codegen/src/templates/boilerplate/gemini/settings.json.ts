/** Gemini CLI picks stdio from `command`; it has no `type` field. */
export const geminiReactorMcpServer = {
  command: "node",
  args: ["--run", "mcp"],
};

/** Gemini CLI reads AGENTS.md only when `context.fileName` names it. */
export const geminiSettingsTemplate = `${JSON.stringify(
  {
    context: { fileName: ["AGENTS.md", "GEMINI.md"] },
    mcpServers: { "reactor-mcp": geminiReactorMcpServer },
  },
  null,
  2,
)}\n`;
