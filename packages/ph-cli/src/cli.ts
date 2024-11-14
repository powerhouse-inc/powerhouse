#!/usr/bin/env node
import { Command } from "commander";
import registerCommands from "./commands/index.js";

const program = new Command();

program
  .name("ph-cli")
  .description("CLI tool for Powerhouse DAO")
  .version("1.0.0");

registerCommands(program);

program.parse(process.argv);
