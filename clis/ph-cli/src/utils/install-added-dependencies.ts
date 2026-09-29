import { boolean, flag, optional } from "cmd-ts";
import { spawnSync } from "node:child_process";
import { detect, resolveCommand } from "package-manager-detector";

export const skipInstallArgs = {
  skipInstall: flag({
    type: optional(boolean),
    long: "skip-install",
    description:
      "Don't install the dependencies the command adds to package.json",
  }),
};

// Installs what a generate command just added to package.json. A failed
// install doesn't fail the command: the files are written, so say what to run.
export async function installAddedDependencies(
  added: readonly string[],
  projectDir: string,
  skipInstall?: boolean,
) {
  if (added.length === 0) return;
  const agent = (await detect({ cwd: projectDir }))?.agent ?? "npm";
  const resolved = resolveCommand(agent, "install", []);
  if (!resolved) return;
  const printed = [resolved.command, ...resolved.args].join(" ");
  if (skipInstall) {
    console.log(`Run \`${printed}\` to install them.`);
    return;
  }
  console.log(`Installing with \`${printed}\`...`);
  const result = spawnSync(resolved.command, resolved.args, {
    cwd: projectDir,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    console.warn(
      `Install failed. Run \`${printed}\` in ${projectDir} to install them.`,
    );
  }
}
