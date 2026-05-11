#!/usr/bin/env node
import {
  initCliTelemetry,
  type TelemetryClient,
} from "@powerhousedao/shared/clis/telemetry";
import { assertNodeVersion } from "@powerhousedao/shared/clis/utils";
import { run } from "cmd-ts";
import { phCliHelp } from "./commands/ph-cli-help.js";
import { phCli } from "./commands/ph-cli.js";
import { getVersion } from "./get-version.js";

let sentryClient: TelemetryClient | undefined = undefined;

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

async function main() {
  assertNodeVersion();
  // Initializes Sentry only if user consented (opt-out by default, asked
  // once on first interactive run). Respects PH_NO_TELEMETRY/DO_NOT_TRACK.
  sentryClient = await initCliTelemetry({
    cliName: "ph-cli",
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
  const hasNoArgs = args.length === 0;
  const isHelp = args.some((arg) => arg === "--help" || arg === "-h");
  const isTopLevelHelp = isHelp && args.length === 1;
  const showTopLevelHelp = hasNoArgs || isTopLevelHelp;
  const cli = showTopLevelHelp ? phCliHelp : phCli;
  const restArgs = args.slice(1);
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
