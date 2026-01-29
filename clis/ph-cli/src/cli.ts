#!/usr/bin/env node
import { assertNodeVersion } from "@powerhousedao/common/clis";
import { run } from "cmd-ts";
import { phCliHelp } from "./commands/ph-cli-help.js";
import { phCli } from "./commands/ph-cli.js";

async function main() {
  assertNodeVersion();
  const args = process.argv.slice(2);
  const hasNoArgs = args.length === 0;
  const isHelp = args.some((arg) => arg === "--help" || arg === "-h");
  const isTopLevelHelp = isHelp && args.length === 1;
  const showTopLevelHelp = hasNoArgs || isTopLevelHelp;
  const cli = showTopLevelHelp ? phCliHelp : phCli;
  const [command, ...restArgs] = args;
  if (
    command === "connect" &&
    !args.some((arg) => !["studio", "build", "preview"].includes(arg)) &&
    !isHelp
  ) {
    const argsWithDefaultConnectSubCommand = ["connect", "studio", ...restArgs];
    await run(cli, argsWithDefaultConnectSubCommand);
  } else {
    await run(cli, args);
  }
  process.exit(0);
}

await main();
