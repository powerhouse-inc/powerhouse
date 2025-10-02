#!/usr/bin/env node
import { Command } from "commander";
import { registerCommands } from "@powerhousedao/ph-cli";

function ensureNodeVersion(minVersion = "22") {
  const version = process.versions.node;
  if (!version) {
    return;
  }

  if (version < minVersion) {
    console.error(
      `Node version ${minVersion} or higher is required. Current version: ${version}`,
    );
    process.exit(1);
  }
}

// Ensure minimum Node.js version
ensureNodeVersion("22");

const program = new Command();

program
  .name("ph-cli")
  .description(
    "The Powerhouse CLI (ph-cli) is a command-line interface tool that provides essential commands for managing Powerhouse projects. The tool and it's commands are fundamental for creating, building, and running Document Models as a builder in studio mode.",
  )
  .allowUnknownOption(true)
  .option("--verbose, --debug", "Enable debug mode");

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore build time version file
import("./version.js")
  .then(({ version }: { version: string }) => program.version(version))
  .catch((error: unknown) => console.error("Error loading version", error));

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
