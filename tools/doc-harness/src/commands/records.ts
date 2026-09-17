import type { Command } from "commander";

export function register(program: Command): void {
  program
    .command("records")
    .description("(not implemented yet)")
    .action(() => {
      throw new Error("records: not implemented");
    });
}
