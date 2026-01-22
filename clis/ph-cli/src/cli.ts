#!/usr/bin/env node
import { assertNodeVersion } from "@powerhousedao/common/clis";
import { run } from "cmd-ts";
import { phCliHelp } from "./commands/ph-cli-help.js";
import { phCli } from "./commands/ph-cli.js";

async function main() {
  assertNodeVersion();
  const args = process.argv.slice(2);
  const hasNoArgs = args.length === 0;
  const isTopLevelHelp =
    args.length === 1 && args.some((arg) => arg === "--help" || arg === "-h");
  const showTopLevelHelp = hasNoArgs || isTopLevelHelp;
  const cli = showTopLevelHelp ? phCliHelp : phCli;

  await run(cli, args);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
