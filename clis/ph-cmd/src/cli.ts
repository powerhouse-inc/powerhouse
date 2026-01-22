#!/usr/bin/env node
import {
  assertNodeVersion,
  phCliCommandNames,
} from "@powerhousedao/common/clis";
import { run } from "cmd-ts";
import { execSync } from "node:child_process";
import { detect, resolveCommand } from "package-manager-detector";
import { ph } from "./commands/ph.js";

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
    await executePhCliCommand("connect studio");
    return;
  }

  // forward command to the local ph-cli installation if it exists
  if (phCliCommandNames.includes(command)) {
    await executePhCliCommand(command);
    return;
  }

  await run(ph, process.argv.slice(2));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
