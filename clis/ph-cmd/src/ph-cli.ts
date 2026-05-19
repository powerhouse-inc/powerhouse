#!/usr/bin/env node
import { getPowerhouseProjectInfo } from "@powerhousedao/shared/clis";
import { spawnSync } from "node:child_process";
import { resolveCommand } from "package-manager-detector";

export async function executePhCliCommand(phCliCommand: string) {
  const forwardedArgs = process.argv.slice(3);
  const { projectPath, packageManager } = await getPowerhouseProjectInfo(
    undefined,
    { silent: true },
  );
  if (!projectPath) {
    throw new Error(
      `No Powerhouse project directory found, cannot run \`ph ${phCliCommand}\`.\nTo create a local project, run \`ph init\`.\nTo create a global project, run \`ph setup-globals\`.`,
    );
  }
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
  // spawn (not execSync via a shell-joined string) so args containing shell
  // metacharacters survive intact — e.g. `ph connect build --json '{"a":"b"}'`
  // would otherwise lose its quotes when re-parsed by the shell.
  const result = spawnSync(command, args, {
    stdio: "inherit",
    cwd: projectPath,
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.signal) {
    throw new Error(`${command} terminated by signal ${result.signal}`);
  }
  if (typeof result.status === "number" && result.status !== 0) {
    process.exit(result.status);
  }
}
