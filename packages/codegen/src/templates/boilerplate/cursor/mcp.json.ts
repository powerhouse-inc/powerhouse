/** Cursor gives no launch directory, so node runs ph-cli from `${workspaceFolder}`. */
export const cursorReactorMcpServer = {
  type: "stdio",
  command: "node",
  args: [
    "${workspaceFolder}/node_modules/@powerhousedao/ph-cli/dist/cli.mjs",
    "mcp",
    "--project-dir",
    "${workspaceFolder}",
  ],
};

export const cursorMcpTemplate = `${JSON.stringify(
  { mcpServers: { "reactor-mcp": cursorReactorMcpServer } },
  null,
  2,
)}\n`;
