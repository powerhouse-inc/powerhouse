import type { Command } from "commander";
import { checkoutCommand } from "./checkout.js";
import { helpCommand } from "./help.js";
import { setupGlobalsCommand } from "./setup-globals.js";
import { useCommand } from "./use.js";
import { versionOption } from "./version.js";
export {
  checkoutCommand,
  helpCommand,
  setupGlobalsCommand,
  useCommand,
  versionOption,
};
export const commands = [
  setupGlobalsCommand,
  checkoutCommand,
  useCommand,
  helpCommand,
  versionOption,
];

export default function registerCommands(program: Command) {
  commands.forEach((command) => command(program));
}
