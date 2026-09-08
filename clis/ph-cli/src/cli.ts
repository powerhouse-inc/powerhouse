#!/usr/bin/env node
import {
  isPhCliJsonReportInvocation,
  phCliCommandsWithSubcommands,
  phCliDefinitionReportCommands,
} from "@powerhousedao/shared/clis/command-names";
import {
  detectPackageManager,
  initCliTelemetry,
  type TelemetryClient,
} from "@powerhousedao/shared/clis/telemetry";
import { assertNodeVersion } from "@powerhousedao/shared/clis/utils";
import { run } from "cmd-ts";
import { phCliHelp } from "./commands/ph-cli-help.js";
import { phCli } from "./commands/ph-cli.js";
import { getVersion } from "./get-version.js";
import {
  isUnrecoverableDbError,
  printDbRecoveryHint,
} from "./utils/db-error-hint.js";

let sentryClient: TelemetryClient | undefined = undefined;

const COMMANDS_WITH_SUBCOMMANDS = new Set<string>(phCliCommandsWithSubcommands);
const DEFINITION_REPORT_COMMANDS = new Set<string>(
  phCliDefinitionReportCommands,
);

function normalizeDefinitionCommandArgs(args: readonly string[]): string[] {
  if (!DEFINITION_REPORT_COMMANDS.has(args[0] ?? "")) {
    return [...args];
  }
  // cmd-ts registers option names across the complete subcommand tree. The
  // existing Connect JSON payload option therefore makes a bare --json look
  // value-taking even for these report commands. Supplying `true` preserves
  // the documented `--json` syntax in any position.
  return args.map((argument) =>
    argument === "--json" ? "--json=true" : argument,
  );
}

async function main() {
  assertNodeVersion();
  const rawArgs = process.argv.slice(2);
  // Initializes Sentry only if user consented (opt-out by default, asked
  // once on first interactive run). Respects PH_NO_TELEMETRY/DO_NOT_TRACK.
  sentryClient = await initCliTelemetry({
    cliName: "ph-cli",
    release: getVersion(),
    promptForConsent: !isPhCliJsonReportInvocation(rawArgs),
  });
  const args = normalizeDefinitionCommandArgs(rawArgs);
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
    argv: rawArgs,
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
    !["studio", "build", "preview", "config"].includes(args[1]) &&
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
    if (isUnrecoverableDbError(error)) {
      printDbRecoveryHint(error);
    }
    process.exit(1);
  } else {
    throw error;
  }
});
