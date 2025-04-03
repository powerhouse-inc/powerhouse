import { type PowerhouseConfig } from "@powerhousedao/config/powerhouse";
import fs from "node:fs";
import { homedir } from "node:os";
import path, { dirname } from "node:path";

export const POWERHOUSE_CONFIG_FILE = "powerhouse.config.json";
export const POWERHOUSE_GLOBAL_DIR = path.join(homedir(), ".ph");
export const SUPPORTED_PACKAGE_MANAGERS = ["npm", "yarn", "pnpm", "bun"];

export const packageManagers = {
  bun: {
    globalPathRegexp: /[\\/].bun[\\/]/,
    installCommand: "bun add {{dependency}}",
    uninstallCommand: "bun remove {{dependency}}",
    workspaceOption: "",
    lockfile: "bun.lock",
    updateCommand: "bun update {{dependency}}",
    buildAffected: "bun run build:affected",
  },
  pnpm: {
    globalPathRegexp: /[\\/]pnpm[\\/]/,
    installCommand: "pnpm add {{dependency}}",
    uninstallCommand: "pnpm remove {{dependency}}",
    workspaceOption: "--workspace-root",
    lockfile: "pnpm-lock.yaml",
    updateCommand: "pnpm update {{dependency}}",
    buildAffected: "pnpm run build:affected",
  },
  yarn: {
    globalPathRegexp: /[\\/]yarn[\\/]/,
    installCommand: "yarn add {{dependency}}",
    uninstallCommand: "yarn remove {{dependency}}",
    workspaceOption: "-W",
    lockfile: "yarn.lock",
    updateCommand: "yarn upgrade {{dependency}}",
    buildAffected: "yarn run build:affected",
  },
  npm: {
    installCommand: "npm install {{dependency}}",
    uninstallCommand: "npm uninstall {{dependency}}",
    workspaceOption: "",
    lockfile: "package-lock.json",
    updateCommand: "npm update {{dependency}} --save",
    buildAffected: "npm run build:affected",
  },
};

type PathValidation = (dir: string) => boolean;

export type PackageManager = "npm" | "yarn" | "pnpm" | "bun";

export type ProjectInfo = {
  isGlobal: boolean;
  path: string;
};

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

export function getProjectInfo(debug?: boolean): ProjectInfo {
  const currentPath = process.cwd();

  if (debug) {
    console.log(">>> currentPath", currentPath);
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

export function updateConfigFile(
  dependencies: string[],
  projectPath: string,
  task: "install" | "uninstall" = "install",
) {
  const configPath = path.join(projectPath, POWERHOUSE_CONFIG_FILE);
  const isInstall = task === "install";

  if (!fs.existsSync(configPath)) {
    throw new Error(
      `powerhouse.config.json file not found. projectPath: ${projectPath}`,
    );
  }

  const config = JSON.parse(
    fs.readFileSync(configPath, "utf-8"),
  ) as PowerhouseConfig;

  const mappedPackages: PowerhouseConfig["packages"] = dependencies.map(
    (dep) => ({
      packageName: dep,
    }),
  );

  const updatedConfig: PowerhouseConfig = {
    ...config,
    packages: isInstall
      ? [
          // replace existing packages if they were already listed on the config file
          ...(config.packages?.filter(
            (packages) =>
              !config.packages?.find(
                (p) => p.packageName === packages.packageName,
              ),
          ) || []),
          ...mappedPackages,
        ]
      : [...(config.packages || [])].filter(
          (pkg) => !dependencies.includes(pkg.packageName),
        ),
  };

  fs.writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2));
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

export { getConfig } from "@powerhousedao/config/powerhouse";
