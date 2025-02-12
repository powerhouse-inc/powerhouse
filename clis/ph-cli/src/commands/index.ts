import { Command } from "commander";
import { connectCommand } from "./connect.js";
import { devCommand } from "./dev.js";
import { generateCommand } from "./generate.js";
import { helpCommand } from "./help.js";
import { installCommand } from "./install.js";
import { listCommand } from "./list.js";
import { serviceCommand } from "./service.js";
import { reactorCommand } from "./switchboard.js";
import { uninstallCommand } from "./uninstall.js";

export const commands = [
  devCommand,
  connectCommand,
  generateCommand,
  reactorCommand,
  helpCommand,
  installCommand,
  uninstallCommand,
  serviceCommand,
  listCommand,
];

export default function registerCommands(program: Command) {
  commands.forEach((command) => command(program));
}

export * from "./connect.js";
export * from "./dev.js";
export * from "./generate.js";
export * from "./help.js";
export * from "./install.js";
export * from "./list.js";
export * from "./service.js";
export * from "./switchboard.js";
export * from "./uninstall.js";
