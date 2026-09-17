import type { Command } from "commander";

export function register(program: Command): void {
  program
    .command("run")
    .description("(not implemented yet)")
    .action(() => {
      throw new Error("run: not implemented");
    });
}
