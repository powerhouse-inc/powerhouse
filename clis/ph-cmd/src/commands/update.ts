import { type Command } from "commander";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { type CommandActionType } from "../types.js";
import {
  findContainerDirectory,
  getPackageManagerFromLockfile,
  getProjectInfo,
  packageManagers,
  type PackageManager,
} from "../utils.js";
import {
  ENV_MAP,
  PH_PROJECT_DEPENDENCIES,
  updatePackageJson,
  type Environment,
} from "./use.js";

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const FILE_PROTOCOL = "file:";
const LINK_PROTOCOL = "link:";
const MONOREPO_FILE = "pnpm-workspace.yaml";

const buildLocalDependencies = (
  localDependencyPath: string,
  pkgManagerName: PackageManager,
) => {
  const monorepoPath = findContainerDirectory(
    localDependencyPath,
    MONOREPO_FILE,
  );

  if (!monorepoPath) {
    throw new Error("Monorepo root directory not found");
  }

  const pkgManager = packageManagers[pkgManagerName];

  console.log("⚙️ Building local dependencies...");
  execSync(pkgManager.buildAffected, {
    stdio: "inherit",
    cwd: monorepoPath,
  });
};

const getLocalDependencyPath = (projectPath: string) => {
  // read package json from projectInfo.path
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(projectPath, "package.json"), "utf-8"),
  ) as PackageJson;

  // filter dependencies
  const filteredDependencies = Object.entries({
    ...(packageJson.dependencies || {}),
    ...(packageJson.devDependencies || {}),
  }).filter(([name]) => PH_PROJECT_DEPENDENCIES.includes(name));

  const [_, localDependencyPath] = filteredDependencies.find(
    ([_, version]) =>
      version.startsWith(FILE_PROTOCOL) || version.startsWith(LINK_PROTOCOL),
  ) || [null, null];

  if (!localDependencyPath) return null;
  return localDependencyPath
    .replace(FILE_PROTOCOL, "")
    .replace(LINK_PROTOCOL, "");
};

const getInstalledDependencies = (projectPath: string) => {
  // read package json from projectInfo.path
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(projectPath, "package.json"), "utf-8"),
  ) as PackageJson;

  // Get all installed Powerhouse dependencies
  const installedDeps = Object.keys({
    ...(packageJson.dependencies || {}),
    ...(packageJson.devDependencies || {}),
  })
    .filter((name) => PH_PROJECT_DEPENDENCIES.includes(name))
    .sort(); // Sort dependencies alphabetically

  return installedDeps;
};

export const update: CommandActionType<
  [
    {
      force?: string;
      debug?: boolean;
      packageManager?: string;
    },
  ]
> = async (options) => {
  const { force, packageManager, debug } = options;

  if (debug) {
    console.log(">>> options", options);
  }

  const projectInfo = await getProjectInfo();
  const pkgManagerName = (packageManager ||
    getPackageManagerFromLockfile(projectInfo.path)) as PackageManager;

  const localDependencyPath = getLocalDependencyPath(projectInfo.path);

  if (debug) {
    console.log(">>> projectInfo", projectInfo);
    console.log(">>> pkgManagerName", pkgManagerName);
    console.log(">>> localDependencyPath", localDependencyPath);
  }

  if (localDependencyPath) {
    buildLocalDependencies(localDependencyPath, pkgManagerName);
  }

  if (force) {
    const supportedEnvs = Object.keys(ENV_MAP);
    if (!supportedEnvs.includes(force)) {
      throw new Error(
        `Invalid environment: ${force}, supported envs: ${supportedEnvs.join(", ")}`,
      );
    }

    const env = force as Environment;
    await updatePackageJson(env, undefined, pkgManagerName, debug);
    return;
  }

  const installedDeps = getInstalledDependencies(projectInfo.path);

  if (installedDeps.length === 0) {
    console.log("ℹ️ No Powerhouse dependencies found to update");
    return;
  }

  const pkgManager = packageManagers[pkgManagerName];
  const deps = installedDeps.join(" ");
  const updateCommand = pkgManager.updateCommand.replace(
    "{{dependency}}",
    deps,
  );

  if (options.debug) {
    console.log(">>> dependencies to update", installedDeps);
  }

  const commandOptions = { cwd: projectInfo.path };

  execSync(updateCommand, {
    stdio: "inherit",
    ...commandOptions,
  });
};

export function updateCommand(program: Command) {
  program
    .command("update")
    .alias("up")
    .description(
      "Allows you to update your dependencies to the latest version based on the specified range in package.json. If you want to update to the latest available version, use the --force flag.",
    )
    .option(
      "--force <env>",
      "Force update to latest available version for the environment specified (dev, prod, latest)",
    )
    .option(
      "--package-manager <packageManager>",
      "force package manager to use",
    )
    .option("--debug", "Show additional logs")
    .addHelpText(
      "after",
      `
Examples:
  $ ph update                          # Update dependencies based on package.json ranges
  $ ph update --force dev              # Force update to latest dev version available
  $ ph update --force prod             # Force update to latest stable version available (same as latest)
  $ ph update --force latest           # Force update to latest stable version available (same as prod)
  $ ph update --package-manager pnpm   # Specify package manager to use
  $ ph update --debug                  # Show debug information during update
    `,
    )
    .action(update);
}
