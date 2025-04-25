import { type Command } from "commander";
import fs from "fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { versionHelp } from "../help.js";
import { type CommandActionType } from "../types.js";
import { findNodeProjectRoot, setCustomHelp } from "../utils.js";

export function getVersion(debug: boolean) {
  const root = findNodeProjectRoot(fileURLToPath(import.meta.url));

  if (debug) {
    console.debug("\n>>> root", root);
  }

  if (!root) {
    throw new Error("Root directory of 'ph-cli' not found.");
  }
  const packageJsonPath = path.join(root, "package.json");
  const file = fs.readFileSync(packageJsonPath, "utf-8");

  const packageJson = JSON.parse(file) as Record<"version", string>;

  if (!packageJson.version) {
    throw new Error(`Version not found in packageJsonPath`);
  }

  return packageJson.version;
}

export const version: CommandActionType<
  [
    {
      debug?: boolean;
    },
  ]
> = async (options) => {
  if (options.debug) {
    console.log(">>> command arguments", { options });
  }

  const version = getVersion(options.debug ?? false);
  console.log("PH CLI version:", version);
};

export function versionCommand(program: Command) {
  const cmd = program
    .command("version")
    .alias("v")
    .description("Display the current version of the PH CLI.")
    .option("--debug", "Show additional logs");

  // Use the setCustomHelp utility to apply custom help formatting
  setCustomHelp(cmd, versionHelp);

  cmd.action(version);
}
