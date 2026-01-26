import type { Command } from "commander";
import { accessTokenCommand } from "./legacy/access-token.old.js";
import { connectCommand } from "./legacy/connect.old.js";
import { generateCommand } from "./legacy/generate.old.js";
import { helpCommand } from "./legacy/help.old.js";
import { inspectCommand } from "./legacy/inspect.old.js";
import { installCommand } from "./legacy/install.old.js";
import { loginCommand } from "./legacy/login.old.js";
import { migrateCommand } from "./legacy/migrate.old.js";
import { serviceCommand } from "./legacy/service.old.js";
import { switchboardCommand } from "./legacy/switchboard.old.js";
import { uninstallCommand } from "./legacy/uninstall.old.js";
import { vetraCommand } from "./legacy/vetra.old.js";
import { listCommand } from "./list.old.js";

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
