import { type Command } from "commander";
import { initCommand } from "./init.js";
import { setupGlobalsCommand } from "./setup-globals.js";
import { updateCommand } from "./update.js";
import { useCommand } from "./use.js";

export const commands = [
  setupGlobalsCommand,
  initCommand,
  useCommand,
  updateCommand,
];

export default function registerCommands(program: Command) {
  commands.forEach((command) => command(program));
}

export * from "./init.js";
export * from "./setup-globals.js";
export * from "./update.js";
export * from "./use.js";

