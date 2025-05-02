#!/usr/bin/env node
import { Command } from "commander";

import { forwardCommand } from "./commands/forward.js";
import registerCommands from "./commands/index.js";
import { type CommandActionType } from "./types.js";
import { generateMergedHelp } from "./utils/index.js";

const program = new Command();

// Flag to prevent duplicate help output
let helpShown = false;

// Custom help handler that uses the merged help functionality
async function customHelpHandler() {
  if (helpShown) return;
  helpShown = true;

  await generateMergedHelp(program);
  process.exit(0);
}

const defaultCommand: CommandActionType<[{ verbose?: boolean }]> = (
  options,
) => {
  const allArgs = process.argv.slice(2);
  const args = allArgs.join(" ");

  const isHelpCommand = args.startsWith("--help") || args.startsWith("-h");
  const isVersionCommand =
    args.startsWith("--version") || args.startsWith("-v");

  // if no args are provided then runs the help command
  if (!args.length) {
    program.parse(process.argv.concat("--help"));
    process.exit(0);
  }

  if (!isHelpCommand && !isVersionCommand) {
    forwardCommand(args, { debug: !!options.verbose }).catch(
      (error: unknown) => {
        if (typeof error === "string" || options.verbose) {
          console.error(error);
        } else if (error instanceof Error) {
          console.error(error.message);
        }
        process.exit(1);
      },
    );
  }
};

program
  .name("ph")
  .description(
    "The Powerhouse CLI (ph-cmd) is a command-line interface tool that provides essential commands for managing Powerhouse projects. The tool and it's commands are fundamental for creating, building, and running Document Models as a builder in studio mode.",
  )
  .allowUnknownOption()
  .option("--verbose, --debug", "Enable debug mode")
  .option("-h, --help", "Display help information");

// Register our commands
registerCommands(program);

// Hook the root action
program.action(defaultCommand);

// Handle global help requests - only for root help, not command-specific help
program.on("option:help", () => {
  // Check if this is a root help command (no other arguments except possibly --verbose)
  const nonHelpArgs = process.argv
    .slice(2)
    .filter((arg) => arg !== "--help" && arg !== "-h");

  // Only run the custom help handler for global help
  if (nonHelpArgs.length === 0) {
    customHelpHandler().catch((error: unknown) => {
      console.error(error);
      process.exit(1);
    });
  }
});

// Logs full error only on debug mode. Otherwise logs only error message
program.parseAsync(process.argv).catch((error: unknown) => {
  const isDebug = process.argv.find((arg) =>
    ["--verbose", "--debug"].includes(arg),
  );
  if (isDebug) {
    console.error(error);
    return;
  }

  const errorMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : JSON.stringify(error, null, 2);
  console.error(errorMessage);
});
