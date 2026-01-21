#!/usr/bin/env node
import {
  phCliCommandNames,
  phCliHelpCommands,
} from "@powerhousedao/common/cli-args";
import { run, subcommands } from "cmd-ts";
import { execSync } from "node:child_process";
import { detect, resolveCommand } from "package-manager-detector";
import { readPackage } from "read-pkg";
import { init } from "./commands/init.js";
import { setupGlobals } from "./commands/setup-globals.js";
import { update } from "./commands/update.js";
import { useLocal } from "./commands/use-local.js";
import { use } from "./commands/use.js";
import {
  getPackageManagerFromLockfile,
  getProjectInfo,
} from "./utils/package-manager.js";

async function executePhCliCommand(command: string) {
  const forwardedArgs = process.argv.slice(3);
  const detectResult = await detect();
  const agent = detectResult?.agent ?? "npm";
  const resolveExecuteLocalCommandResult = resolveCommand(
    agent,
    "execute-local",
    ["ph-cli", command, ...forwardedArgs],
  );
  if (!resolveExecuteLocalCommandResult) {
    throw new Error(
      `Command ${command} is not executable by package manager ${agent}. Either install "@powerhousedao/ph-cli" in your local package, or run \`ph setup-globals\` to globally install the "@powerhousedao/ph-cli" package.`,
    );
  }
  const { command: packageManager, args: localCommandToExecute } =
    resolveExecuteLocalCommandResult;
  const cmd = `${packageManager} ${localCommandToExecute.join(" ")}`;
  execSync(cmd, { stdio: "inherit" });
}

async function main() {
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
    await executePhCliCommand("connect studio");
    process.exit(0);
  }

  // forward command to the local ph-cli installation if it exists
  if (phCliCommandNames.includes(command)) {
    await executePhCliCommand(command);
    process.exit(0);
  }

  // Normal cmd-ts processing
  const versionInfo = await getVersionInfo();

  const ph = subcommands({
    name: "ph",
    version: versionInfo,
    description:
      "The Powerhouse CLI (ph-cmd) is a command-line interface tool that provides essential commands for managing Powerhouse projects.\nThe tool and it's commands are fundamental for creating, building, and running Document Models as a builder in studio mode.",
    cmds: {
      init,
      use,
      update,
      "setup-globals": setupGlobals,
      "use-local": useLocal,
      ...phCliHelpCommands,
    },
  });
  await run(ph, process.argv.slice(2));
}

await main();

async function getVersionInfo() {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore build time version file
  const { version } = (await import("./version.js")) as { version: string };

  const phCliInfo = await getPhCliInfo();

  return `
-------------------------------------
PH CMD version: ${version}
${phCliInfo}
-------------------------------------
`.trim();
}

async function getPhCliInfo() {
  const projectInfo = await getProjectInfo(undefined, false);

  if (!projectInfo.available)
    return "PH CLI is not available, please run `ph setup-globals` to generate the default global project";

  const packageManager = getPackageManagerFromLockfile(projectInfo.path);

  const packageJson = await readPackage({ cwd: projectInfo.path });

  const phCliVersion =
    packageJson.dependencies?.["@powerhousedao/ph-cli"] ??
    packageJson.devDependencies?.["@powerhousedao/ph-cli"] ??
    "Not found";

  return `
PH CLI version: ${phCliVersion}
PH CLI path: ${projectInfo.path}
PH CLI is global project: ${projectInfo.isGlobal}
PH CLI package manager: ${packageManager}
`.trim();
}
