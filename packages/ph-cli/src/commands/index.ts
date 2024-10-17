import { Command } from "commander";

import { devCommand } from "./dev";
import { helpCommand } from "./help";
import { initCommand } from "./init";
import { createDocumentCommand } from "./create-document";

export const commands = [
  initCommand,
  createDocumentCommand,
  devCommand,
  helpCommand,
];

export default function registerCommands(program: Command) {
  commands.forEach((command) => command(program));
}

export * from "./dev";
export * from "./help";
export * from "./init";
export * from "./create-document";
