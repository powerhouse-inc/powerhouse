import type { Command } from "commander";
import { connectCommand } from "./connect.js";
// import { devCommand } from "./dev.js";
import { generateCommand } from "./generate.js";
import { helpCommand } from "./help.js";
import { inspectCommand } from "./inspect.js";
import { installCommand } from "./install.js";
import { listCommand } from "./list.js";
import { reactorCommand } from "./reactor.js";
import { serviceCommand } from "./service.js";
import { switchboardCommand } from "./switchboard.js";
import { uninstallCommand } from "./uninstall.js";
import { vetraCommand } from "./vetra.js";

export const commands = [
  // devCommand,
  connectCommand,
  generateCommand,
  reactorCommand,
  helpCommand,
  installCommand,
  uninstallCommand,
  serviceCommand,
  listCommand,
  inspectCommand,
  switchboardCommand,
  vetraCommand,
];

export function registerCommands(program: Command) {
  commands.forEach((command) => command(program));
}
