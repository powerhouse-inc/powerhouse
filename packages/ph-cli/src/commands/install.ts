import path, { dirname } from "node:path";
import fs from "node:fs";
import { execSync } from "node:child_process";
import { homedir } from "node:os";
import { Command } from "commander";
import { PowerhouseConfig } from "@powerhousedao/config/powerhouse";

import { CommandActionType } from "../types.js";

const PH_BIN = "ph";
const POWERHOUSE_CONFIG_FILE = "powerhouse.config.json";
const SUPPORTED_PACKAGE_MANAGERS = ["npm", "yarn", "pnpm", "bun"];
const GLOBAL_CONFIG_PATH = path.join(homedir(), ".ph", POWERHOUSE_CONFIG_FILE);

const packageManagers = {
  bun: {
    globalPathRegexp: /[\\/].bun[\\/]/,
    installCommand: "bun add {{dependency}}",
    workspaceOption: "",
    lockfile: "bun.lock",
  },
  pnpm: {
    globalPathRegexp: /[\\/]pnpm[\\/]/,
    installCommand: "pnpm add {{dependency}}",
    workspaceOption: "--workspace-root",
    lockfile: "pnpm-lock.yaml",
  },
  yarn: {
    globalPathRegexp: /[\\/]yarn[\\/]/,
    installCommand: "yarn add {{dependency}}",
    workspaceOption: "-W",
    lockfile: "yarn.lock",
  },
  npm: {
    installCommand: "npm install {{dependency}}",
    workspaceOption: "",
    lockfile: "package-lock.json",
  },
};

export type ProjectInfo = {
  isGlobal: boolean;
  path: string;
};

export type PackageManager = "npm" | "yarn" | "pnpm" | "bun";

type PathValidation = (dir: string) => boolean;

export function defaultPathValidation() {
  return true;
}

export function isPowerhouseProject(dir: string) {
  const powerhouseConfigPath = path.join(dir, POWERHOUSE_CONFIG_FILE);

  return fs.existsSync(powerhouseConfigPath);
}

export function findNodeProjectRoot(
  dir: string,
  pathValidation: PathValidation = defaultPathValidation,
) {
  const packageJsonPath = path.join(dir, "package.json");

  if (fs.existsSync(packageJsonPath) && pathValidation(dir)) {
    return dir;
  }

  const parentDir = dirname(dir);

  if (parentDir === dir) {
    return null;
  }

  return findNodeProjectRoot(parentDir, pathValidation);
}

export function findGlobalPhPath() {
  const command =
    process.platform === "win32" ? `where ${PH_BIN}` : `which ${PH_BIN}`;

  try {
    return execSync(command, { encoding: "utf-8" }).trim();
  } catch {
    return null;
  }
}

export function getPackageManagerFromPath(dir: string): PackageManager {
  const lowerCasePath = dir.toLowerCase();

  if (packageManagers.bun.globalPathRegexp.test(lowerCasePath)) {
    return "bun";
  } else if (packageManagers.pnpm.globalPathRegexp.test(lowerCasePath)) {
    return "pnpm";
  } else if (packageManagers.yarn.globalPathRegexp.test(lowerCasePath)) {
    return "yarn";
  }

  return "npm";
}

export function getPackageManagerFromLockfile(dir: string): PackageManager {
  if (fs.existsSync(path.join(dir, packageManagers.pnpm.lockfile))) {
    return "pnpm";
  } else if (fs.existsSync(path.join(dir, packageManagers.yarn.lockfile))) {
    return "yarn";
  } else if (fs.existsSync(path.join(dir, packageManagers.bun.lockfile))) {
    return "bun";
  }

  return "npm";
}

export function getProjectInfo(debug?: boolean): ProjectInfo {
  const currentPath = process.cwd();

  if (debug) {
    console.log(">>> currentPath", currentPath);
  }

  const projectPath = findNodeProjectRoot(currentPath, isPowerhouseProject);

  if (!projectPath) {
    const globalPath = findGlobalPhPath();

    if (!globalPath) {
      throw new Error(
        "❌ Could not find a powerhouse project or a global ph-cmd installation",
      );
    }

    return {
      isGlobal: true,
      path: globalPath,
    };
  }

  return {
    isGlobal: false,
    path: projectPath,
  };
}

export function installDependency(
  packageManager: PackageManager,
  dependencies: string[],
  global = false,
  projectPath?: string,
  workspace?: boolean,
) {
  if (!global && !projectPath) {
    console.error("Project path is required for local installations");
  }

  const manager = packageManagers[packageManager];

  let installCommand = manager.installCommand.replace(
    "{{dependency}}",
    dependencies.join(" "),
  );

  if (global) {
    installCommand += " -g";
  }

  if (workspace) {
    installCommand += ` ${manager.workspaceOption}`;
  }

  const commandOptions = global ? {} : { cwd: projectPath };

  execSync(installCommand, {
    stdio: "inherit",
    ...commandOptions,
  });
}

export function updateConfigFile(
  dependencies: string[],
  global: boolean,
  projectPath: string,
  debug?: boolean,
) {
  const configPath = global
    ? GLOBAL_CONFIG_PATH
    : path.join(projectPath, POWERHOUSE_CONFIG_FILE);

  if (!global && !fs.existsSync(configPath)) {
    throw new Error(
      `powerhouse.config.json file not found. global: ${global}; projectPath: ${projectPath}`,
    );
  }

  // Create an empty config file if it doesn't exist (only for global)
  if (global && !fs.existsSync(configPath)) {
    if (debug) {
      console.log(">>> Creating a new global config file: ", configPath);
    }

    // create empty json config file in config path and create missing directories
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, "{}");
  }

  const config = JSON.parse(
    fs.readFileSync(configPath, "utf-8"),
  ) as PowerhouseConfig;

  const updatedConfig: PowerhouseConfig = {
    ...config,
    projects: [...((config.projects || []) as string[]), ...dependencies],
  };

  fs.writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2));
}

export const install: CommandActionType<
  [
    string[] | undefined,
    {
      debug?: boolean;
      global?: boolean;
      workspace?: boolean;
      packageManager?: string;
    },
  ]
> = (dependencies, options) => {
  if (options.debug) {
    console.log(">>> command arguments", { dependencies, options });
  }

  if (!dependencies || dependencies.length === 0) {
    throw new Error("❌ Dependency name is required");
  }

  if (
    options.packageManager &&
    !SUPPORTED_PACKAGE_MANAGERS.includes(options.packageManager)
  ) {
    throw new Error(
      "❌ Unsupported package manager. Supported package managers: npm, yarn, pnpm, bun",
    );
  }

  const projectInfo = getProjectInfo(options.debug);

  if (options.debug) {
    console.log("\n>>> projectInfo", projectInfo);
  }

  const isGlobal = options.global || projectInfo.isGlobal;
  const getPackageManager = isGlobal
    ? getPackageManagerFromPath
    : getPackageManagerFromLockfile;

  const packageManager =
    options.packageManager || getPackageManager(projectInfo.path);

  if (options.debug) {
    console.log("\n>>> installDependency arguments:");
    console.log(">>> packageManager", packageManager);
    console.log(">>> dependencies", dependencies);
    console.log(">>> isGlobal", isGlobal);
    console.log(">>> projectPath", projectInfo.path);
    console.log(">>> workspace", options.workspace);
  }

  try {
    console.log("installing dependencies 📦 ...");
    installDependency(
      packageManager as PackageManager,
      dependencies,
      isGlobal,
      projectInfo.path,
      options.workspace,
    );
    console.log("Dependency installed successfully 🎉");
  } catch (error) {
    console.error("❌ Failed to install dependencies");
    throw error;
  }

  if (options.debug) {
    console.log("\n>>> updateConfigFile arguments:");
    console.log(">>> dependencies", dependencies);
    console.log(">>> isGlobal", isGlobal);
    console.log(">>> projectPath", projectInfo.path);
  }

  try {
    console.log("⚙️ Updating powerhouse config file...");
    updateConfigFile(dependencies, isGlobal, projectInfo.path, options.debug);
    console.log("Config file updated successfully 🎉");
  } catch (error) {
    console.error("❌ Failed to update config file");
    throw error;
  }
};

export function installCommand(program: Command) {
  program
    .command("install")
    .description("Install a powerhouse dependency")
    .argument("[dependencies...]", "Names of the dependencies to install")
    .option("-g, --global", "Install the dependency globally")
    .option("--debug", "Show additional logs")
    .option(
      "-w, --workspace",
      "Install the dependency in the workspace (use this option for monorepos)",
    )
    .option(
      "--package-manager <packageManager>",
      "force package manager to use",
    )
    .action(install);
}
