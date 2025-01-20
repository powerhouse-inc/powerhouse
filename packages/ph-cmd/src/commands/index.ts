import { Command } from "commander";
import { initCommand } from "./init.js";

export const commands = [initCommand];

export default function registerCommands(program: Command) {
  commands.forEach((command) => command(program));
}

export * from "./init.js";
