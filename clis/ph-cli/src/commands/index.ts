import { type Command } from "commander";
import { connectCommand } from "./connect.js";
// import { devCommand } from "./dev.js";
import { generateCommand } from "./generate.js";
import { helpCommand } from "./help.js";
import { inspectCommand } from "./inspect.js";
import { installCommand } from "./install.js";
import { listCommand } from "./list.js";
import { serviceCommand } from "./service.js";
import { reactorCommand } from "./switchboard.js";
import { uninstallCommand } from "./uninstall.js";
import { updateCommand } from "./update.js";
import { useCommand } from "./use.js";
import { versionCommand } from "./version.js";

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
  versionCommand,
  useCommand,
  updateCommand,
];

export default function registerCommands(program: Command) {
  commands.forEach((command) => command(program));
}
