import type { Command } from "commander";

export function register(program: Command): void {
  program
    .command("report")
    .description("(not implemented yet)")
    .action(() => {
      throw new Error("report: not implemented");
    });
}
