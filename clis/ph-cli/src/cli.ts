#!/usr/bin/env node
import {
  assertNodeVersion,
  captureCliError,
  initCliTelemetry,
} from "@powerhousedao/shared/clis";
import { run } from "cmd-ts";
import { phCliHelp } from "./commands/ph-cli-help.js";
import { phCli } from "./commands/ph-cli.js";
import { version } from "./version.js";

async function main() {
  assertNodeVersion();
  // Initializes Sentry only if user consented (opt-out by default, asked
  // once on first interactive run). Respects PH_NO_TELEMETRY/DO_NOT_TRACK.
  await initCliTelemetry({ cliName: "ph-cli", release: version });
  const args = process.argv.slice(2);
  const hasNoArgs = args.length === 0;
  const isHelp = args.some((arg) => arg === "--help" || arg === "-h");
  const isTopLevelHelp = isHelp && args.length === 1;
  const showTopLevelHelp = hasNoArgs || isTopLevelHelp;
  const cli = showTopLevelHelp ? phCliHelp : phCli;
  const [command, ...restArgs] = args;
  if (
    command === "connect" &&
    !["studio", "build", "preview"].includes(args[1]) &&
    !isHelp
  ) {
    const argsWithDefaultConnectSubCommand = ["connect", "studio", ...restArgs];
    await run(cli, argsWithDefaultConnectSubCommand);
  } else {
    await run(cli, args);
  }
}

await main().catch(async (error) => {
  const isDebug = process.argv.slice(2).includes("--debug");
  // Report to Sentry (no-op when telemetry disabled) before exiting.
  await captureCliError(error);
  if (isDebug) {
    throw error;
  }
  if (error instanceof Error) {
    console.error(error.message);
    process.exit(1);
  } else {
    throw error;
  }
});
