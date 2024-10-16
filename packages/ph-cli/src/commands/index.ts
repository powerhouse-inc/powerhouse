import { Command } from "commander";

import { helpCommand } from "./help";
import { initCommand } from "./init";
import { createDocumentCommand } from "./create-document";

export const commands = [initCommand, createDocumentCommand, helpCommand];

export default function registerCommands(program: Command) {
  commands.forEach((command) => command(program));
}

export * from "./help";
export * from "./init";
export * from "./create-document";
