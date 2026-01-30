export function runWorkspaceCommand(command: string) {
  Bun.spawnSync({
    cmd: ["pnpm", command],
    stdio: ["inherit", "inherit", "inherit"],
  });
}
