#!/usr/bin/env node
import { phCliCommandNames } from "@powerhousedao/shared/clis/command-names";
import {
  initCliTelemetry,
  type TelemetryClient,
} from "@powerhousedao/shared/clis/telemetry";
import { assertNodeVersion } from "@powerhousedao/shared/clis/utils";
import { getVersion } from "./get-version.js";

// Commands whose second positional is itself a subcommand (vs. a project
// name / file path). Keeping this explicit avoids high-cardinality tag
// values like `subcommand:my-package` polluting Sentry.
const COMMANDS_WITH_SUBCOMMANDS = new Set(["connect", "vetra"]);

function detectPackageManager(): string | undefined {
  // npm, pnpm, yarn and bun all set npm_config_user_agent like
  // "pnpm/8.5.0 npm/? node/v20.11.1 darwin arm64". When the user invokes
  // `ph` directly (not via dlx/exec) it's typically unset — skip the tag
  // in that case rather than mislabel.
  const ua = process.env.npm_config_user_agent;
  if (!ua) return undefined;
  return ua.split(" ")[0]?.split("/")[0] || undefined;
}

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

let sentryClient: TelemetryClient | undefined = undefined;

async function main() {
  assertNodeVersion();
  // Opt-out telemetry; asked once on first interactive run. No-op under
  // PH_NO_TELEMETRY / DO_NOT_TRACK / CI.
  sentryClient = await initCliTelemetry({
    cliName: "ph-cmd",
    release: getVersion(),
  });
  const args = process.argv.slice(2);
  const command = args[0];
  const subcommand =
    command &&
    COMMANDS_WITH_SUBCOMMANDS.has(command) &&
    args[1] &&
    !args[1].startsWith("-")
      ? args[1]
      : undefined;
  sentryClient?.attachInvocationContext({
    command,
    subcommand,
    pm: detectPackageManager(),
    argv: args,
    cwd: process.cwd(),
  });

  // Short-circuit `ph --version` / `ph -v` so we don't pay for the full
  // cmd-ts subcommand tree (which dynamic-imports the heavy clis bundle
  // just to populate the `version` field). `ph use --version 1.2.3` and
  // similar are unaffected because they have a subcommand first.
  if (args.length === 1 && (command === "--version" || command === "-v")) {
    const { getPhCmdVersionInfo } = await import("@powerhousedao/shared/clis");
    console.log(await getPhCmdVersionInfo(getVersion()));
    process.exit(0);
  }

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
  if (
    phCliCommandNames.includes(command as (typeof phCliCommandNames)[number])
  ) {
    await runPhCliCommand(command);
    process.exit(0);
  }

  await runPhCmdCommand(args);
  process.exit(0);
}

await main().catch(async (error) => {
  const isDebug = process.argv.slice(2).includes("--debug");
  // No-op when telemetry is disabled; flushes before we exit otherwise.
  await sentryClient?.captureCliError(error);
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
