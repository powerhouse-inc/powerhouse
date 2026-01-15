import {
  accessToken,
  connect,
  generate,
  inspect,
  install,
  list,
  login,
  migrate,
  phCliHelpCommands,
  switchboard,
  uninstall,
  vetra,
} from "@powerhousedao/ph-cli/commands";
import { run, subcommands } from "cmd-ts";

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
