import type { Command } from "commander";
import { accessTokenCommand } from "./access-token.js";
import { connectCommand } from "./connect.js";
import { generateCommand } from "./generate.js";
import { helpCommand } from "./help.js";
import { initProfilingCommand } from "./init-profiling.js";
import { inspectCommand } from "./inspect.js";
import { installCommand } from "./install.js";
import { listCommand } from "./list.js";
import { loginCommand } from "./login.js";
import { migrateCommand } from "./migrate.js";
import { serviceCommand } from "./service.js";
import { switchboardCommand } from "./switchboard.js";
import { uninstallCommand } from "./uninstall.js";
import { vetraCommand } from "./vetra.js";

export const commands = [
  accessTokenCommand,
  connectCommand,
  generateCommand,
  helpCommand,
  initProfilingCommand,
  installCommand,
  uninstallCommand,
  serviceCommand,
  listCommand,
  inspectCommand,
  loginCommand,
  switchboardCommand,
  vetraCommand,
  migrateCommand,
];

export function registerCommands(program: Command) {
  commands.forEach((command) => command(program));
}
