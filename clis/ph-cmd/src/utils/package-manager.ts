import {
  POWERHOUSE_CONFIG_FILE,
  POWERHOUSE_GLOBAL_DIR,
} from "@powerhousedao/common/clis";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path, { dirname } from "node:path";
import { packageManagers } from "./constants.js";
import { createGlobalProject } from "./create-global-project.js";
import type { PackageManager, PathValidation, ProjectInfo } from "./types.js";

export function defaultPathValidation() {
  return true;
}

export function isPowerhouseProject(dir: string) {
  const powerhouseConfigPath = path.join(dir, POWERHOUSE_CONFIG_FILE);

  return existsSync(powerhouseConfigPath);
}

export function findNodeProjectRoot(
  dir: string,
  pathValidation: PathValidation = defaultPathValidation,
) {
  const packageJsonPath = path.join(dir, "package.json");

  if (existsSync(packageJsonPath) && pathValidation(dir)) {
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
  if (existsSync(path.join(dir, packageManagers.pnpm.lockfile))) {
    return "pnpm";
  } else if (existsSync(path.join(dir, packageManagers.yarn.lockfile))) {
    return "yarn";
  } else if (existsSync(path.join(dir, packageManagers.bun.lockfile))) {
    return "bun";
  }

  return "npm";
}

export async function getProjectInfo(
  debug?: boolean,
  generateGlobalProject = true,
): Promise<ProjectInfo> {
  const currentPath = process.cwd();

  if (debug) {
    console.log(">>> currentPath:", currentPath);
  }

  const projectPath = findNodeProjectRoot(currentPath, isPowerhouseProject);

  if (!projectPath) {
    let available = existsSync(POWERHOUSE_GLOBAL_DIR);

    if (generateGlobalProject) {
      await createGlobalProject();
      available = true;
    }

    return {
      available,
      isGlobal: true,
      path: POWERHOUSE_GLOBAL_DIR,
    };
  }

  return {
    isGlobal: false,
    available: true,
    path: projectPath,
  };
}

export function forwardPHCommand(
  packageManager: PackageManager,
  projectPath: string,
  args: string,
  debug?: boolean,
  captureOutput = false,
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

  if (captureOutput) {
    // Capture output and return it
    try {
      return execSync(execCommand, {
        stdio: "pipe",
        encoding: "utf8",
        ...commandOptions,
      });
    } catch (error) {
      throw new Error(
        `Failed to execute command: ${execCommand}\nError: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  } else {
    // Original behavior - pipe directly to stdout/stderr
    execSync(execCommand, {
      stdio: "inherit",
      ...commandOptions,
    });
    return "";
  }
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

  if (existsSync(filePath)) {
    return startPath;
  }

  const parentDir = path.dirname(startPath);

  //reached the root directory and haven't found the file
  if (parentDir === startPath) {
    return null;
  }

  return findContainerDirectory(parentDir, targetFile);
};
