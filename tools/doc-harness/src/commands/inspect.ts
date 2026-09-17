import type { Command } from "commander";

export function register(program: Command): void {
  program
    .command("inspect")
    .description("(not implemented yet)")
    .action(() => {
      throw new Error("inspect: not implemented");
    });
}
