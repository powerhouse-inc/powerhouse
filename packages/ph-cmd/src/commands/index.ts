import { Command } from "commander";
import { setupGlobalsCommand } from "./setup-globals.js";

export const commands = [setupGlobalsCommand];

export default function registerCommands(program: Command) {
  commands.forEach((command) => command(program));
}

export * from "./setup-globals.js";
