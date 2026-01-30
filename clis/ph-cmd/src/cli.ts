#!/usr/bin/env node
import {
  assertNodeVersion,
  getPowerhouseProjectInfo,
  phCliCommandNames,
} from "@powerhousedao/common/clis";
import { run } from "cmd-ts";
import { execSync } from "node:child_process";
import { resolveCommand } from "package-manager-detector";
import { ph } from "./commands/ph.js";

async function executePhCliCommand(phCliCommand: string) {
  const forwardedArgs = process.argv.slice(3);
  const { projectPath, packageManager } = await getPowerhouseProjectInfo();
  const resolveExecuteLocalCommandResult = resolveCommand(
    packageManager,
    "execute-local",
    ["ph-cli", phCliCommand, ...forwardedArgs],
  );
  if (!resolveExecuteLocalCommandResult) {
    throw new Error(
      `Command ${phCliCommand} is not executable by package manager ${packageManager}. Either install "@powerhousedao/ph-cli" in your local package, or run \`ph setup-globals\` to globally install the "@powerhousedao/ph-cli" package.`,
    );
  }
  const { command, args } = resolveExecuteLocalCommandResult;
  const cmd = `${command} ${args.join(" ")}`;
  execSync(cmd, { stdio: "inherit", cwd: projectPath });
}

async function main() {
  assertNodeVersion();
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
    await executePhCliCommand("connect");
    process.exit(0);
  }

  // forward command to the local ph-cli installation if it exists
  if (phCliCommandNames.includes(command)) {
    await executePhCliCommand(command);
    process.exit(0);
  }

  await run(ph, args);
  process.exit(0);
}

await main();
