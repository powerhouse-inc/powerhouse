import {
  getPackageManagerAtPowerhouseProjectDirPath,
  getPowerhouseProjectInstallCommand,
} from "@powerhousedao/shared/clis";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type Feature, syncFeatureDependencies } from "./features.js";

export type InstallAddedDependenciesOptions = {
  skipInstall?: boolean;
  log?: (message: string) => void;
  warn?: (message: string) => void;
  /** What waits on the install, e.g. `processor "orders"`; said in the log. */
  waiting?: string;
  /** Called as the install starts, with what it installs and the command. */
  onInstall?: (packages: readonly string[], command: string) => void;
};

// One package.json edit or install at a time per process: Vetra can confirm
// several modules at once, and two edits from one read would drop one's deps.
let installs: Promise<unknown> = Promise.resolve();
let pending = 0;

/** Runs `task` after the installs queued before it, one at a time per process. */
export function serializeInstall<T>(task: () => Promise<T>): Promise<T> {
  pending++;
  const run = installs.then(task).finally(() => {
    pending--;
  });
  installs = run.catch(() => undefined);
  return run;
}

/** Whether an install, or the package.json edit before it, is queued or running. */
export function installsPending(): boolean {
  return pending > 0;
}

/** Resolves once the installs queued so far have finished, failed or not. */
export function afterPendingInstalls(): Promise<void> {
  return installs.then(() => undefined);
}

/** Installs what a generator just added to package.json; resolves to whether
 * an install ran and passed. A failed one says what to run instead of throwing. */
export function installAddedDependencies(
  added: readonly string[],
  projectDir: string,
  options: InstallAddedDependenciesOptions = {},
): Promise<boolean> {
  return serializeInstall(() => install(added, projectDir, options));
}

/** Adds what `features` need to package.json and installs it, one call at a
 * time; resolves to the packages added. */
export function installFeatureDependencies(
  features: readonly Feature[],
  projectDir: string,
  options: InstallAddedDependenciesOptions = {},
): Promise<string[]> {
  return serializeInstall(async () => {
    const added = await syncFeatureDependencies(
      features,
      projectDir,
      options.log,
    );
    await install(added, projectDir, options);
    return added;
  });
}

/** The root importer's resolved versions in pnpm-lock.yaml, peer suffixes cut. */
export function lockedRootVersions(
  projectDir: string,
): Map<string, string> | undefined {
  let lockfile: string;
  try {
    lockfile = readFileSync(join(projectDir, "pnpm-lock.yaml"), "utf8");
  } catch {
    return undefined;
  }
  const lines = lockfile.split(/\r?\n/);
  const start = lines.indexOf("  .:");
  if (start < 0) return undefined;
  const versions = new Map<string, string>();
  let name: string | undefined;
  for (const line of lines.slice(start + 1)) {
    // The next importer, or the next top-level key.
    if (/^ {0,2}\S/.test(line)) break;
    const dependency = /^ {6}'?([^']+?)'?:$/.exec(line);
    if (dependency) {
      name = dependency[1];
      continue;
    }
    const version = /^ {8}version: (.+)$/.exec(line);
    if (name && version) versions.set(name, version[1].split("(")[0]);
  }
  return versions;
}

/** What the install changed in the root importer besides `added`. */
function otherLockChanges(
  before: Map<string, string> | undefined,
  after: Map<string, string> | undefined,
  added: readonly string[],
): string[] {
  if (!before || !after) return [];
  const changes: string[] = [];
  for (const [pkg, version] of before) {
    const now = after.get(pkg);
    if (now === undefined) changes.push(`${pkg} ${version} removed`);
    else if (now !== version) changes.push(`${pkg} ${version} -> ${now}`);
  }
  for (const [pkg, version] of after) {
    if (!before.has(pkg) && !added.includes(pkg)) {
      changes.push(`${pkg} ${version} added`);
    }
  }
  return changes;
}

// pnpm freezes the lockfile under CI; what codegen just added must update it.
const UNFROZEN_LOCKFILE = {
  npm_config_frozen_lockfile: "false",
  pnpm_config_frozen_lockfile: "false",
};

async function install(
  added: readonly string[],
  projectDir: string,
  {
    skipInstall,
    log = console.log,
    warn = console.warn,
    waiting,
    onInstall,
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
  log(
    `Installing ${added.join(", ")} with \`${command}\`` +
      (waiting ? `; ${waiting} is written once it finishes...` : "..."),
  );
  onInstall?.(added, command);
  const before = lockedRootVersions(projectDir);
  const startedAt = Date.now();
  const status = await new Promise<number | null>((resolve) => {
    const child = spawn(command, {
      cwd: projectDir,
      stdio: "inherit",
      shell: true,
      env: { ...process.env, ...UNFROZEN_LOCKFILE },
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
  const seconds = Math.round((Date.now() - startedAt) / 1000);
  log(`Installed ${added.join(", ")} in ${seconds}s.`);
  const changes = otherLockChanges(
    before,
    lockedRootVersions(projectDir),
    added,
  );
  if (changes.length > 0) {
    warn(
      `The install also changed pnpm-lock.yaml beyond ${added.join(", ")}: ${changes.join("; ")}. Review it before committing.`,
    );
  }
  return true;
}
