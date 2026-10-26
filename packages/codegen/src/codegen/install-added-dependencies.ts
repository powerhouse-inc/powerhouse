import {
  getPackageManagerAtPowerhouseProjectDirPath,
  getPowerhouseProjectInstallCommand,
} from "@powerhousedao/shared/clis";
import { spawn } from "node:child_process";

export type InstallAddedDependenciesOptions = {
  skipInstall?: boolean;
  log?: (message: string) => void;
  warn?: (message: string) => void;
};

// One install at a time per process: Vetra can confirm several modules at once.
let installs: Promise<unknown> = Promise.resolve();

/** Installs what a generator just added to package.json; resolves to whether
 * an install ran and passed. A failed one says what to run instead of throwing. */
export function installAddedDependencies(
  added: readonly string[],
  projectDir: string,
  options: InstallAddedDependenciesOptions = {},
): Promise<boolean> {
  const run = installs.then(() => install(added, projectDir, options));
  installs = run.catch(() => undefined);
  return run;
}

async function install(
  added: readonly string[],
  projectDir: string,
  {
    skipInstall,
    log = console.log,
    warn = console.warn,
  }: InstallAddedDependenciesOptions,
): Promise<boolean> {
  if (added.length === 0) return false;
  const agent =
    (await getPackageManagerAtPowerhouseProjectDirPath(projectDir)) ?? "npm";
  const command = await getPowerhouseProjectInstallCommand(agent);
  if (skipInstall) {
    log(`Run \`${command}\` to install them.`);
    return false;
  }
  log(`Installing with \`${command}\`...`);
  const status = await new Promise<number | null>((resolve) => {
    const child = spawn(command, {
      cwd: projectDir,
      stdio: "inherit",
      shell: true,
    });
    child.on("error", () => resolve(null));
    child.on("close", resolve);
  });
  if (status !== 0) {
    warn(
      `Install failed. Run \`${command}\` in ${projectDir} to install them.`,
    );
    return false;
  }
  return true;
}
