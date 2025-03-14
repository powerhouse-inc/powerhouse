import { type Command } from "commander";
import { setupGlobalsCommand } from "./setup-globals.js";
import { initCommand } from "./init.js";

export const commands = [setupGlobalsCommand, initCommand];

export default function registerCommands(program: Command) {
  commands.forEach((command) => command(program));
}

export * from "./setup-globals.js";
export * from "./init.js";
