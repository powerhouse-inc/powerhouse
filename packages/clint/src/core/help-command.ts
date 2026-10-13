import { z } from "zod";
import type { Cli, Command, CommandContext } from "./types.js";

export interface HelpCommandOptions {
  /** Lazy reference to the CLI's run function (resolved after defineCli returns). */
  getCli: () => Cli;
}

const PREAMBLE =
  "As a CLI-first agent, your tools map directly onto CLI commands that the user can invoke " +
  "through the command line directly, in interactive mode, or through you. Use the /cli-docs " +
  "tool to learn more about the CLI capabilities and your own tools.";

/**
 * Create the built-in `cli-docs` command for a CLI.
 *
 * Captures Commander's own help output so the agent sees exactly the same
 * text the user gets from `mycli help` / `mycli help <command>`, with
 * headings reworded for agent context.
 */
export function createHelpCommand(opts: HelpCommandOptions): Command {
  const inputSchema = z.object({
    command: z
      .string()
      .optional()
      .describe("Command name to get help for (omit for general help)"),
  });

  return {
    id: "cli-docs",
    description: "Show CLI help or help for a specific command",
    inputSchema,
    execute: async (input, _context: CommandContext) => {
      const { command: commandId } = input as { command?: string };
      const cli = opts.getCli();

      // Build argv to invoke Commander's help.
      // Use --help (flag) rather than help (subcommand) because Commander
      // only registers the help subcommand when there are other subcommands.
      const argv = ["node", cli.name];
      if (commandId) {
        argv.push(commandId, "--help");
      } else {
        argv.push("--help");
      }

      // Capture Commander's output
      const chunks: string[] = [];
      await cli.run(argv, {
        stdout: (msg) => chunks.push(msg),
        stderr: (msg) => chunks.push(msg),
        exit: () => {},
      });

      const helpText = chunks
        .join("\n")
        .replace(/^Usage: /m, "CLI Usage: ")
        .replace(/^Options:/m, "CLI Options:")
        .replace(/^Commands:/m, "Commands / Agent Tools:");
      return { text: `${PREAMBLE}\n\n${helpText}` };
    },
  };
}
