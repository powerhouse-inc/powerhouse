import type { Command } from "commander";
import { checkoutCommand } from "./legacy/checkout.js";
import { helpCommand } from "./legacy/help.js";
import { versionOption } from "./legacy/version.js";
import { setupGlobalsCommand } from "./legacy/setup-globals.js";
export { checkoutCommand, helpCommand, setupGlobalsCommand, versionOption };
export const commands = [
  setupGlobalsCommand,
  checkoutCommand,
  helpCommand,
  versionOption,
];

export default function registerCommands(program: Command) {
  commands.forEach((command) => command(program));
}
