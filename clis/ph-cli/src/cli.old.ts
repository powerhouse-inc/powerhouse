#!/usr/bin/env node
import { assertNodeVersion } from "@powerhousedao/common/clis";
import { Command } from "commander";
import { registerCommands } from "./commands/register-commands.js";

console.log("Running legacy ph-cli...");

// Ensure minimum Node.js version
assertNodeVersion();

const program = new Command();

program
  .name("ph-cli")
  .description(
    "The Powerhouse CLI (ph-cli) is a command-line interface tool that provides essential commands for managing Powerhouse projects. The tool and it's commands are fundamental for creating, building, and running Document Models as a builder in studio mode.",
  )
  .allowUnknownOption(true)
  .option("--verbose, --debug", "Enable debug mode");

program.version(
  process.env.WORKSPACE_VERSION || process.env.npm_package_version!,
);

registerCommands(program);

// Logs full error only on debug mode. Otherwise logs only error message
program.parseAsync(process.argv).catch((error: unknown) => {
  const isDebug = process.argv.find((arg) =>
    ["--verbose", "--debug"].includes(arg),
  );
  if (isDebug) {
    console.error(error);
    return;
  }

  const errorMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : JSON.stringify(error, null, 2);

  console.error(errorMessage);
});
