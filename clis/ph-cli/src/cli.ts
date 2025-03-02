#!/usr/bin/env node
import { Command } from "commander";
import registerCommands from "./commands/index.js";
import { getVersion } from "./commands/version.js";

const program = new Command();

program.name("ph-cli").description("CLI tool for Powerhouse DAO");

try {
  const version = getVersion(false);
  program.version(version);
} catch {
  /* empty */
}

registerCommands(program);

program.parse(process.argv);
