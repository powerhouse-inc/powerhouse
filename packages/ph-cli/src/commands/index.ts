import { Command } from "commander";

import { devCommand } from "./dev";
import { helpCommand } from "./help";
import { initCommand } from "./init";
import { generateCommand } from "./generate";

export const commands = [initCommand, devCommand, generateCommand, helpCommand];

export default function registerCommands(program: Command) {
  commands.forEach((command) => command(program));
}

export * from "./dev";
export * from "./help";
export * from "./init";
export * from "./generate";
