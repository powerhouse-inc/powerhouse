import type { Command } from "commander";
import { accessTokenCommand } from "./access-token.old.js";
import { connectCommand } from "./connect.old.js";
import { generateCommand } from "./generate.old.js";
import { helpCommand } from "./help.old.js";
import { inspectCommand } from "./inspect.old.js";
import { installCommand } from "./install.old.js";
import { listCommand } from "./list.old.js";
import { loginCommand } from "./login.old.js";
import { migrateCommand } from "./migrate.old.js";
import { serviceCommand } from "./service.old.js";
import { switchboardCommand } from "./switchboard.old.js";
import { uninstallCommand } from "./uninstall.old.js";
import { vetraCommand } from "./vetra.old.js";

export const commands = [
  accessTokenCommand,
  connectCommand,
  generateCommand,
  helpCommand,
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
