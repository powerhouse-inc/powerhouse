import type { Command } from "commander";
import { generateMergedHelp } from "../../utils/help-formatting.js";

/**
 * Registers the help command with Commander
 * @param {Command} program - Commander program instance
 */
export function helpCommand(program: Command) {
  program
    .command("help")
    .description("Display help information")
    .action(async () => {
      await generateMergedHelp(program);
    });
}
