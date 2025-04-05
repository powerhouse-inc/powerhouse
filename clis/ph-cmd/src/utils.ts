import { execSync } from "node:child_process";
import fs from "node:fs";
import { homedir } from "node:os";
import path, { dirname } from "node:path";

export const PH_BIN_PATH = process.argv[1];
export const PH_BIN = "ph-cli";
export const PH_CLI_COMMANDS = [
  "init",
  "dev",
  "connect",
  "generate",
  "reactor",
  "switchboard",
  "help",
  "install",
  "add",
  "i",
  "remove",
  "uninstall",
  "service",
  "list",
  "inspect",
  "version",
];
export const POWERHOUSE_CONFIG_FILE = "powerhouse.config.json";
export const HOME_DIR = homedir();
export const PH_GLOBAL_PROJECT_NAME = ".ph";
export const POWERHOUSE_GLOBAL_DIR = path.join(
  HOME_DIR,
  PH_GLOBAL_PROJECT_NAME,
);

export const packageManagers = {
  bun: {
    installCommand: "bun add {{dependency}}",
    execCommand: `bun ${PH_BIN} {{arguments}}`,
    execScript: `bun {{arguments}}`,
    lockfile: "bun.lock",
    globalPathRegexp: /[\\/].bun[\\/]/,
    updateCommand: "bun update {{dependency}}",
    buildAffected: "bun run build:affected",
    workspaceOption: "",
  },
  pnpm: {
    installCommand: "pnpm add {{dependency}}",
    execCommand: `pnpm exec ${PH_BIN} {{arguments}}`,
    execScript: `pnpm {{arguments}}`,
    lockfile: "pnpm-lock.yaml",
    globalPathRegexp: /[\\/]pnpm[\\/]/,
    updateCommand: "pnpm update {{dependency}}",
    buildAffected: "pnpm run build:affected",
    workspaceOption: "--workspace-root",
  },
  yarn: {
    installCommand: "yarn add {{dependency}}",
    execCommand: `yarn ${PH_BIN} {{arguments}}`,
    execScript: `yarn {{arguments}}`,
    lockfile: "yarn.lock",
    globalPathRegexp: /[\\/]yarn[\\/]/,
    updateCommand: "yarn upgrade {{dependency}}",
    buildAffected: "yarn run build:affected",
    workspaceOption: "-W",
  },
  npm: {
    installCommand: "npm install {{dependency}}",
    execCommand: `npx ${PH_BIN} {{arguments}}`,
    execScript: `npm run {{arguments}}`,
    lockfile: "package-lock.json",
    updateCommand: "npm update {{dependency}} --save",
    buildAffected: "npm run build:affected",
    workspaceOption: "",
  },
} as const;

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
    console.log(">>> currentPath:", currentPath);
  }

  const projectPath = findNodeProjectRoot(currentPath, isPowerhouseProject);

  if (!projectPath) {
    return {
      isGlobal: true,
      path: POWERHOUSE_GLOBAL_DIR,
    };
  }

  return {
    isGlobal: false,
    path: projectPath,
  };
}

export function forwardPHCommand(
  packageManager: PackageManager,
  projectPath: string,
  args: string,
  debug?: boolean,
) {
  const manager = packageManagers[packageManager];
  const command = manager.execCommand;
  const execCommand = command.replace("{{arguments}}", args);

  const commandOptions = { cwd: projectPath };

  if (debug) {
    console.log(">>> execCommand:", execCommand);
    console.log(">>> commandOptions:", commandOptions);
    console.log(">>> projectPath:", projectPath);
    console.log(">>> packageManager:", packageManager);
  }

  execSync(execCommand, {
    stdio: "inherit",
    ...commandOptions,
  });
}

/**
 * Recursively searches for a specific file by traversing up the directory tree.
 * Starting from the given path, it checks each parent directory until it finds
 * the target file or reaches the root directory.
 *
 * @param startPath - The absolute path of the directory to start searching from
 * @param targetFile - The name of the file to search for (e.g., 'package.json', 'pnpm-workspace.yaml')
 * @returns The absolute path of the directory containing the target file, or null if not found
 *
 * @example
 * // Find the workspace root directory
 * const workspaceRoot = findContainerDirectory('/path/to/project/src', 'pnpm-workspace.yaml');
 *
 * // Find the nearest package.json
 * const packageDir = findContainerDirectory('/path/to/project/src/components', 'package.json');
 */
export const findContainerDirectory = (
  startPath: string,
  targetFile: string,
): string | null => {
  const filePath = path.join(startPath, targetFile);

  if (fs.existsSync(filePath)) {
    return startPath;
  }

  const parentDir = path.dirname(startPath);

  //reached the root directory and haven't found the file
  if (parentDir === startPath) {
    return null;
  }

  return findContainerDirectory(parentDir, targetFile);
};

export function installDependency(
  packageManager: PackageManager,
  dependencies: string[],
  projectPath: string,
  workspace?: boolean,
) {
  if (!fs.existsSync(projectPath)) {
    throw new Error(`Project path not found: ${projectPath}`);
  }

  const manager = packageManagers[packageManager];

  let installCommand = manager.installCommand.replace(
    "{{dependency}}",
    dependencies.join(" "),
  );

  if (workspace) {
    installCommand += ` ${manager.workspaceOption}`;
  }

  const commandOptions = { cwd: projectPath };

  execSync(installCommand, {
    stdio: "inherit",
    ...commandOptions,
  });
}
