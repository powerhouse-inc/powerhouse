#!/usr/bin/env node
import {
  assertNodeVersion,
  captureCliError,
  initCliTelemetry,
  phCliCommandNames,
} from "@powerhousedao/shared/clis";
import { version } from "./version.js";

/**
 * ph-cli and ph-cmd are loaded lazily so that the node version is checked before
 * any code is parsed to avoid errors on startup due to unsupported dependencies.
 */

async function runPhCliCommand(phCliCommand: string) {
  const { executePhCliCommand } = await import("./ph-cli.js");
  return await executePhCliCommand(phCliCommand);
}
async function runPhCmdCommand(args: string[]) {
  const { run } = await import("./run.js");
  return await run(args);
}

async function main() {
  assertNodeVersion();
  // Opt-out telemetry; asked once on first interactive run. No-op under
  // PH_NO_TELEMETRY / DO_NOT_TRACK / CI.
  await initCliTelemetry({ cliName: "ph-cmd", release: version });
  const args = process.argv.slice(2);
  const command = args[0];

  // handle the special case where running `connect` with no positional argument
  // defaults to `connect studio`
  if (
    command === "connect" &&
    !args.some((arg) => ["studio", "build", "preview"].includes(arg)) &&
    // do not default to `connect studio` when help is present, instead show general help
    // for the `connect` command
    !args.some((arg) => ["--help", "-h"].includes(arg))
  ) {
    await runPhCliCommand("connect");
    process.exit(0);
  }

  // forward command to the local ph-cli installation if it exists
  if (phCliCommandNames.includes(command)) {
    await runPhCliCommand(command);
    process.exit(0);
  }

  await runPhCmdCommand(args);
  process.exit(0);
}

await main().catch(async (error) => {
  const isDebug = process.argv.slice(2).includes("--debug");
  // No-op when telemetry is disabled; flushes before we exit otherwise.
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
