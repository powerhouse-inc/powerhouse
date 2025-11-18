import type { Command } from "commander";
import { checkoutCommand } from "./checkout.js";
import { helpCommand } from "./help.js";
import { initCommand } from "./init.js";
import { setupGlobalsCommand } from "./setup-globals.js";
import { updateCommand } from "./update.js";
import { useCommand } from "./use.js";
import { versionOption } from "./version.js";
export {
  checkoutCommand,
  helpCommand,
  initCommand,
  setupGlobalsCommand,
  updateCommand,
  useCommand,
  versionOption,
};
export const commands = [
  setupGlobalsCommand,
  initCommand,
  checkoutCommand,
  useCommand,
  updateCommand,
  helpCommand,
  versionOption,
];

export default function registerCommands(program: Command) {
  commands.forEach((command) => command(program));
}
