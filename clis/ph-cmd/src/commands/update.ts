import { type Command } from "commander";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { updateHelp } from "../help.js";
import { type CommandActionType } from "../types.js";
import {
  findContainerDirectory,
  getPackageManagerFromLockfile,
  getProjectInfo,
  packageManagers,
  resolvePackageManagerOptions,
  withCustomHelp,
  type PackageManager,
} from "../utils/index.js";
import {
  ENV_MAP,
  detectPowerhousePackages,
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

  // Get all Powerhouse packages from package.json
  const powerhousePackages = detectPowerhousePackages(packageJson);
  
  // filter dependencies
  const filteredDependencies = Object.entries({
    ...(packageJson.dependencies || {}),
    ...(packageJson.devDependencies || {}),
  }).filter(([name]) => powerhousePackages.includes(name));

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

  // Get all installed Powerhouse dependencies using dynamic detection
  const powerhousePackages = detectPowerhousePackages(packageJson);
  const installedDeps = powerhousePackages.sort(); // Sort dependencies alphabetically

  return installedDeps;
};

// Extract the type parameters for reuse
export type UpdateOptions = {
  force?: string;
  debug?: boolean;
  packageManager?: string;
  pnpm?: boolean;
  yarn?: boolean;
  bun?: boolean;
};

export const update: CommandActionType<[UpdateOptions]> = async (options) => {
  const { force, debug } = options;

  if (debug) {
    console.log(">>> options", options);
  }

  const projectInfo = await getProjectInfo();
  const pkgManagerName = (resolvePackageManagerOptions(options) ||
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

export function updateCommand(program: Command): Command {
  const updateCmd = program
    .command("update")
    .alias("up")
    .description(
      "Allows you to update your dependencies to the latest version based on the specified range in package.json. If you want to update to the latest available version, use the --force flag.",
    )
    .option(
      "--force <env>",
      "Force update to latest available version for the environment specified (dev, prod, latest)",
    )
    .option("--package-manager <packageManager>", "package manager to be used")
    .option("--pnpm", "Use 'pnpm' as package manager")
    .option("--yarn", "Use 'yarn' as package manager")
    .option("--bun", "Use 'bun' as package manager")
    .option("--debug", "Show additional logs");

  // Use withCustomHelp instead of withHelpAction and addHelpText
  return withCustomHelp<[UpdateOptions]>(updateCmd, update, updateHelp);
}
