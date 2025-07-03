import { type Command } from "commander";
import { helpCommand } from "./help.js";
import { initCommand } from "./init.js";
import { setupGlobalsCommand } from "./setup-globals.js";
import { updateCommand } from "./update.js";
import { useCommand } from "./use.js";
import { versionOption } from "./version.js";

export const commands = [
  setupGlobalsCommand,
  initCommand,
  useCommand,
  updateCommand,
  helpCommand,
  versionOption,
];

export default function registerCommands(program: Command) {
  commands.forEach((command) => command(program));
}
