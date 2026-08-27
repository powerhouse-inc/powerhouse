#!/usr/bin/env node
import { getPowerhouseProjectInfo } from "@powerhousedao/shared/clis";
import spawn from "cross-spawn";
import { resolveCommand } from "package-manager-detector";
import { getVersion } from "./get-version.js";

const PH_CLI_PACKAGE = "@powerhousedao/ph-cli";

// Auth/identity commands write global state (~/.renown.json, ~/.npmrc), not a
// project, so they run outside a project via dlx when no ph-cli is installed.
const PROJECT_OPTIONAL_COMMANDS = new Set([
  "login",
  "logout",
  "registry-login",
]);

export async function executePhCliCommand(phCliCommand: string) {
  const forwardedArgs = process.argv.slice(3);
  const { projectPath, packageManager } = await getPowerhouseProjectInfo(
    undefined,
    { silent: true },
  );

  if (!projectPath && !PROJECT_OPTIONAL_COMMANDS.has(phCliCommand)) {
    throw new Error(
      `No Powerhouse project directory found, cannot run \`ph ${phCliCommand}\`.\nTo create a local project, run \`ph init\`.\nTo create a global project, run \`ph setup-globals\`.`,
    );
  }

  // In a project run the installed binary; otherwise dlx ph-cli pinned to this
  // ph-cmd version, falling back to `latest` when the version is unknown.
  const version = getVersion();
  const phCliTarget = projectPath
    ? "ph-cli"
    : `${PH_CLI_PACKAGE}@${version === "unknown" ? "latest" : version}`;
  const action = projectPath ? "execute-local" : "execute";

  const resolved = resolveCommand(packageManager, action, [
    phCliTarget,
    phCliCommand,
    ...forwardedArgs,
  ]);
  if (!resolved) {
    throw new Error(
      `Could not resolve a "${action}" command for package manager "${packageManager}" to run ph-cli. Supported package managers: npm, pnpm, yarn, bun.`,
    );
  }

  if (!projectPath) {
    const { injectPnpmAllowBuilds } =
      await import("@powerhousedao/shared/clis");
    injectPnpmAllowBuilds(packageManager, resolved);
  }

  const { command, args } = resolved;
  // spawn (not a shell-joined string) so args with shell metacharacters — e.g.
  // `connect build --json '{"a":"b"}'` — survive intact. cross-spawn keeps that
  // guarantee on Windows too: `command` here is an npx/pnpm/yarn `.cmd` shim,
  // which node:child_process refuses to run without `shell: true` (spawn
  // EINVAL), and `shell: true` is exactly what would break those arguments.
  const result = spawn.sync(command, args, {
    stdio: "inherit",
    cwd: projectPath ?? process.cwd(),
  });
  if (result.error) throw result.error;
  if (result.signal) {
    throw new Error(`${command} terminated by signal ${result.signal}`);
  }
  if (typeof result.status === "number" && result.status !== 0) {
    process.exit(result.status);
  }
}
