#!/usr/bin/env node
import { Command } from "commander";
import registerCommands from "./commands/index.js";
import { forwardCommand } from "./commands/forward.js";
import { CommandActionType } from "./types.js";
import { PH_CLI_COMMANDS } from "./utils.js";

const program = new Command();

const defaultCommand: CommandActionType<[{ verbose?: boolean }]> = (
  options,
) => {
  const allArgs = process.argv.slice(2);
  const filteredArgs = allArgs.filter((arg) => arg !== "--verbose");
  const command = filteredArgs.at(0);

  const isPackageScript = !PH_CLI_COMMANDS.includes(command ?? "");
  const args = filteredArgs.join(" ");

  forwardCommand(args, { debug: !!options.verbose, isPackageScript });
};

program
  .name("ph-cmd")
  .description("CLI tool for Powerhouse DAO")
  .allowUnknownOption()
  .option("--verbose", "Enable debug mode")
  .action(defaultCommand)
  .version("1.0.0");

registerCommands(program);

program.parse(process.argv);
