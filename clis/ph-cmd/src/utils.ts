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
    execCommand: `bun ${PH_BIN} {{arguments}}`,
    execScript: `bun {{arguments}}`,
    lockfile: "bun.lock",
    globalPathRegexp: /[\\/].bun[\\/]/,
  },
  pnpm: {
    execCommand: `pnpm exec ${PH_BIN} {{arguments}}`,
    execScript: `pnpm {{arguments}}`,
    lockfile: "pnpm-lock.yaml",
    globalPathRegexp: /[\\/]pnpm[\\/]/,
  },
  yarn: {
    execCommand: `yarn ${PH_BIN} {{arguments}}`,
    execScript: `yarn {{arguments}}`,
    lockfile: "yarn.lock",
    globalPathRegexp: /[\\/]yarn[\\/]/,
  },
  npm: {
    execCommand: `npx ${PH_BIN} {{arguments}}`,
    execScript: `npm run {{arguments}}`,
    lockfile: "package-lock.json",
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
  isPackageScript: boolean,
  debug?: boolean,
) {
  const manager = packageManagers[packageManager];
  const command = isPackageScript ? manager.execScript : manager.execCommand;
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
