#!/usr/bin/env node
import { Command } from "commander";
import registerCommands from "./commands/index.js";
import { version } from "./version.js";

const program = new Command();

program
  .name("ph-cli")
  .description(
    "The Powerhouse CLI (ph-cli) is a command-line interface tool that provides essential commands for managing Powerhouse projects. The tool and it's commands are fundamental for creating, building, and running Document Models as a builder in studio mode.",
  )
  .version(version);

registerCommands(program);

program.parse(process.argv);
