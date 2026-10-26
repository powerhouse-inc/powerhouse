/** Gemini CLI reads AGENTS.md only when `context.fileName` names it. */
export const geminiSettingsTemplate = `${JSON.stringify(
  {
    context: { fileName: ["AGENTS.md", "GEMINI.md"] },
    mcpServers: {
      "reactor-mcp": { type: "http", url: "http://localhost:4001/mcp" },
    },
  },
  null,
  2,
)}\n`;
