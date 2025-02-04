#!/usr/bin/env node
import { Command } from "commander";

import registerCommands from "./commands/index.js";
import { forwardCommand } from "./commands/forward.js";
import { CommandActionType } from "./types.js";
import { PH_CLI_COMMANDS } from "./utils.js";

const program = new Command();

const defaultCommand: CommandActionType<
  [{ verbose?: boolean; script?: boolean }]
> = (options) => {
  const allArgs = process.argv.slice(2);
  const filteredArgs = allArgs
    .filter((arg) => arg !== "--verbose")
    .filter((arg) => arg !== "--script");
  const command = filteredArgs.at(0);

  const isPackageScript =
    options.script ?? !PH_CLI_COMMANDS.includes(command ?? "");
  const args = filteredArgs.join(" ");

  forwardCommand(args, { debug: !!options.verbose, isPackageScript });
};

program
  .name("ph-cmd")
  .description("CLI tool for Powerhouse DAO")
  .allowUnknownOption()
  .option("--verbose", "Enable debug mode")
  .option("--script", "Run the command as a package.json script")
  .action(defaultCommand)
  .version(process.env.APP_VERSION ?? "1.0.0");

registerCommands(program);

program.parse(process.argv);
