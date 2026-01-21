#!/usr/bin/env node
import { phCliHelpCommands } from "@powerhousedao/common/cli-args";
import { run, subcommands } from "cmd-ts";
import { accessToken } from "./commands/access-token.js";
import { install } from "./commands/install.js";
import { list } from "./commands/list.js";
import { migrate } from "./commands/migrate.js";
import { switchboard } from "./commands/switchboard.js";
import { uninstall } from "./commands/uninstall.js";
import { vetra } from "./commands/vetra.js";
import { generate } from "./commands/generate.js";
import { connect } from "./commands/connect.js";
import { inspect } from "./commands/inspect.js";
import { login } from "./commands/login.js";

const phCliCommands = {
  generate,
  vetra,
  connect,
  "access-token": accessToken,
  inspect,
  list,
  migrate,
  switchboard,
  login,
  install,
  uninstall,
};

async function main() {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore build time version file
  const { version } = (await import("./version.js")) as { version: string };
  const args = process.argv.slice(2);
  const hasNoArgs = args.length == 0;
  const isTopLevelHelp =
    args.length == 1 && args.some((arg) => arg === "--help" || arg === "-h");
  const showTopLevelHelp = hasNoArgs || isTopLevelHelp;

  const cmds = showTopLevelHelp ? phCliHelpCommands : phCliCommands;

  const phCli = subcommands({
    name: "ph-cli",
    description:
      "The Powerhouse CLI (ph-cli) is a command-line interface tool that provides essential commands for managing Powerhouse projects. The tool and it's commands are fundamental for creating, building, and running Document Models as a builder in studio mode.",
    version,
    cmds,
  });

  await run(phCli, args);
}

await main();
