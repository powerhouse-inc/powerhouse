import {
  fetchPackageVersionFromNpmRegistry,
  parsePackageManager,
} from "@powerhousedao/codegen/utils";
import npa from "npm-package-arg";
import { detect, resolveCommand, type Agent } from "package-manager-detector";
import type { PackageManagerArgs } from "../index.js";
import {
  findNodeProjectRoot,
  isPowerhouseProject,
  POWERHOUSE_GLOBAL_DIR,
} from "../utils.js";
import { directoryExists } from "./file-system.js";

export async function getLocalPowerhouseProjectDirPath() {
  const projectPath = findNodeProjectRoot(process.cwd(), isPowerhouseProject);
  if (!projectPath) return undefined;
  const projectPathExists = await directoryExists(projectPath);
  if (!projectPathExists) return undefined;
  return projectPath;
}

export async function getGlobalPowerhouseProjectDirPath() {
  const hasPowerhouseGlobalDir = await directoryExists(POWERHOUSE_GLOBAL_DIR);
  if (!hasPowerhouseGlobalDir) return undefined;
  return POWERHOUSE_GLOBAL_DIR;
}

export async function getPackageManagerAtPowerhouseProjectDirPath(
  projectDirPath: string | undefined,
) {
  const detectResult = await detect({
    cwd: projectDirPath,
  });
  return detectResult?.agent;
}

export function getPowerhouseProjectInstallCommand(
  packageManagerAgent: Agent,
  args: string[] = [],
) {
  const resolvedCommand = resolveCommand(packageManagerAgent, "install", args);
  if (!resolvedCommand) {
    console.warn(
      `Failed to get install command in project directory, calling back to 'npm install'`,
    );
    return "npm install";
  }
  const { command: packageManager, args: installArgs } = resolvedCommand;
  return `${packageManager} ${installArgs.join(" ")}`;
}

export async function getPowerhouseProjectUninstallCommand(
  projectDirPath: string | undefined,
  args: string[] = [],
) {
  const agent =
    await getPackageManagerAtPowerhouseProjectDirPath(projectDirPath);
  if (!agent) {
    console.warn(
      `Failed to detect package manager in project directory, falling back to 'npm' as package manager.`,
    );
  }
  const resolvedCommand = resolveCommand(agent ?? "npm", "uninstall", args);
  if (!resolvedCommand) {
    console.warn(
      `Failed to get uninstall command in project directory, calling back to 'npm uninstall'`,
    );
    return "npm uninstall";
  }
  const { command: packageManager, args: uninstallArgs } = resolvedCommand;
  return `${packageManager} ${uninstallArgs.join(" ")}`;
}

export async function makeDependenciesWithVersions(dependencies: string[]) {
  const dependenciesWithVersions = await Promise.all(
    dependencies.map(async (dependency) => {
      const { name } = npa(dependency);
      if (!name) {
        throw new Error(`Package name for ${dependency} is invalid.`);
      }
      const version = await fetchPackageVersionFromNpmRegistry(dependency);
      return {
        name,
        version,
      };
    }),
  );
  return dependenciesWithVersions;
}

export async function getPowerhouseProjectInfo(args?: PackageManagerArgs) {
  const localProjectPath = await getLocalPowerhouseProjectDirPath();
  const globalProjectPath = await getGlobalPowerhouseProjectDirPath();
  const projectPath = localProjectPath ?? globalProjectPath;
  if (!projectPath) {
    throw new Error(
      "Powerhouse project does not exist. Either create a new project with `ph init` or run `ph setup-globals` to use a global project.",
    );
  }
  const isGlobal = !localProjectPath && !!globalProjectPath;
  if (isGlobal) {
    console.log("Using global Powerhouse project...");
  }
  const packageManagerFromArgs = parsePackageManager(args);
  const packageManagerFromProject =
    await getPackageManagerAtPowerhouseProjectDirPath(projectPath);

  if (
    packageManagerFromArgs &&
    packageManagerFromProject &&
    packageManagerFromArgs !== packageManagerFromProject
  ) {
    throw new Error(
      `You specified package manager ${packageManagerFromArgs} but your project already has dependencies installed with ${packageManagerFromProject}. Please first remove your lockfile and node_modules before running install with ${packageManagerFromArgs}.`,
    );
  }

  if (!packageManagerFromArgs && !packageManagerFromProject) {
    console.warn(
      "No package manager specified or detected, falling back to `npm`...",
    );
  }

  const packageManager =
    packageManagerFromArgs ?? packageManagerFromProject ?? "npm";

  return {
    projectPath,
    localProjectPath,
    globalProjectPath,
    packageManager,
    isGlobal,
  };
}
