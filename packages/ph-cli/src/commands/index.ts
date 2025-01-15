import { Command } from "commander";
import { devCommand } from "./dev.js";
import { helpCommand } from "./help.js";
import { initCommand } from "./init.js";
import { connectCommand } from "./connect.js";
import { reactorCommand } from "./reactor.js";
import { generateCommand } from "./generate.js";
import { installCommand } from "./install.js";

export const commands = [
  initCommand,
  devCommand,
  connectCommand,
  generateCommand,
  reactorCommand,
  helpCommand,
  installCommand,
];

export default function registerCommands(program: Command) {
  commands.forEach((command) => command(program));
}

export * from "./dev.js";
export * from "./help.js";
export * from "./init.js";
export * from "./generate.js";
export * from "./reactor.js";
