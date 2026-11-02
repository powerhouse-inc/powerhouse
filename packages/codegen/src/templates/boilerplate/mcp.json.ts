/** `ph mcp` through the project's `mcp` script: node needs no `cmd /c` on
 * Windows, as npx does, and finds package.json from a subfolder. */
export const reactorMcpServer = {
  type: "stdio",
  command: "node",
  args: ["--run", "mcp"],
};

export const mcpTemplate = `${JSON.stringify(
  { mcpServers: { "reactor-mcp": reactorMcpServer } },
  null,
  2,
)}\n`;
