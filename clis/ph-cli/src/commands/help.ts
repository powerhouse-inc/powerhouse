import { Command } from "commander";

export function helpCommand(program: Command) {
  program
    .command("help")
    .description("Display help information")
    .action(() => {
      program.help();
    });
}
