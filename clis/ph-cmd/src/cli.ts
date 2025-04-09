#!/usr/bin/env node
import { Command } from "commander";

import { forwardCommand } from "./commands/forward.js";
import registerCommands from "./commands/index.js";
import { type CommandActionType } from "./types.js";

const program = new Command();

const defaultCommand: CommandActionType<
  [{ verbose?: boolean; script?: boolean }]
> = (options) => {
  const allArgs = process.argv.slice(2);
  const filteredArgs = allArgs.filter((arg) => arg !== "--verbose");
  const args = filteredArgs.join(" ");

  forwardCommand(args, { debug: !!options.verbose });
};

program
  .name("ph-cmd")
  .description("CLI tool for Powerhouse DAO")
  .allowUnknownOption()
  .option("--verbose", "Enable debug mode")
  .action(defaultCommand);

registerCommands(program);

program.parse(process.argv);
