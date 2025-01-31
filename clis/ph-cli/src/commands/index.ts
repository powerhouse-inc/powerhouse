import { Command } from "commander";
import { connectCommand } from "./connect.js";
import { devCommand } from "./dev.js";
import { generateCommand } from "./generate.js";
import { helpCommand } from "./help.js";
import { installCommand } from "./install.js";
import { reactorCommand } from "./switchboard.js";

import { serviceCommand } from "./service.js";
export const commands = [
  devCommand,
  connectCommand,
  generateCommand,
  reactorCommand,
  helpCommand,
  installCommand,
  serviceCommand,
];

export default function registerCommands(program: Command) {
  commands.forEach((command) => command(program));
}

export * from "./dev.js";
export * from "./generate.js";
export * from "./help.js";
export * from "./switchboard.js";
export * from "./service.js";
