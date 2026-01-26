import { command } from "cmd-ts";
import { accessTokenArgs } from "./access-token.js";
import { connectArgs } from "./connect.js";
import { generateArgs } from "./generate.js";
import { inspectArgs } from "./inspect.js";
import { installArgs } from "./install.js";
import { listArgs } from "./list.js";
import { loginArgs } from "./login.js";
import { migrateArgs } from "./migrate.js";
import { switchboardArgs } from "./switchboard.js";
import { uninstallArgs } from "./uninstall.js";
import { vetraArgs } from "./vetra.js";

export const phCliHelpCommands = {
  generate: command({
    name: "generate",
    args: generateArgs,
    description: "Generate powerhouse code",
    handler: () => {},
  }),
  vetra: command({
    name: "vetra",
    args: vetraArgs,
    description:
      "Starts Vetra development environment with switchboard, reactor, and connect",
    handler: () => {},
  }),
  connect: command({
    name: "connect",
    args: connectArgs,
    description: "Powerhouse Connect commands",
    handler: () => {},
  }),
  list: command({
    name: "list",
    aliases: ["l"],
    args: listArgs,
    description: "List installed packages",
    handler: () => {},
  }),
  "access-token": command({
    name: "access-token",
    args: accessTokenArgs,
    description: "Generate a bearer token for API authentication",
    handler: () => {},
  }),
  inspect: command({
    name: "inspect",
    aliases: ["is"],
    args: inspectArgs,
    description: "Inspect a package",
    handler: () => {},
  }),
  migrate: command({
    name: "migrate",
    args: migrateArgs,
    description: "Run migrations",
    handler: () => {},
  }),
  switchboard: command({
    name: "switchboard",
    aliases: ["reactor"],
    args: switchboardArgs,
    description: "Starts local Switchboard",
    handler: () => {},
  }),
  login: command({
    name: "login",
    args: loginArgs,
    description: "Authenticate with Renown using your Ethereum wallet",
    handler: () => {},
  }),
  install: command({
    name: "install",
    aliases: ["add", "i"],
    args: installArgs,
    description: "Install a Powerhouse dependency",
    handler: () => {},
  }),
  uninstall: command({
    name: "uninstall",
    aliases: ["remove"],
    args: uninstallArgs,
    description: "Uninstall a Powerhouse dependency",
    handler: () => {},
  }),
};

export const phCliCommandNames = Object.values(phCliHelpCommands).flatMap(
  (cmd) => {
    return [cmd.name, ...(cmd.aliases ?? [])];
  },
);
