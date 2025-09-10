import type { PowerhouseConfig } from "@powerhousedao/config/powerhouse";
import type { Command } from "commander";
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

export function updatePackagesArray(
  currentPackages: PowerhouseConfig["packages"] = [],
  dependencies: { name: string; version: string | undefined; full: string }[],
  task: "install" | "uninstall" = "install",
): PowerhouseConfig["packages"] {
  const isInstall = task === "install";
  const mappedPackages = dependencies.map((dep) => ({
    packageName: dep.name,
    version: dep.version,
    provider: "npm" as const,
  }));

  if (isInstall) {
    // Overwrite existing package if version is different
    const filteredPackages = currentPackages.filter(
      (pkg) => !dependencies.find((dep) => dep.name === pkg.packageName),
    );
    return [...filteredPackages, ...mappedPackages];
  }

  return currentPackages.filter(
    (pkg) => !dependencies.map((dep) => dep.name).includes(pkg.packageName),
  );
}

// Modify updateConfigFile to use the new function
export function updateConfigFile(
  dependencies: { name: string; version: string | undefined; full: string }[],
  projectPath: string,
  task: "install" | "uninstall" = "install",
) {
  const configPath = path.join(projectPath, POWERHOUSE_CONFIG_FILE);

  if (!fs.existsSync(configPath)) {
    throw new Error(
      `powerhouse.config.json file not found. projectPath: ${projectPath}`,
    );
  }

  const config = JSON.parse(
    fs.readFileSync(configPath, "utf-8"),
  ) as PowerhouseConfig;

  const updatedConfig: PowerhouseConfig = {
    ...config,
    packages: updatePackagesArray(config.packages, dependencies, task),
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

/**
 * Applies custom help formatting to a command to avoid duplication in help output
 *
 * @param command - The Command instance to enhance
 * @param helpText - The custom help text to display
 * @returns The command for chaining
 */
export function setCustomHelp(command: Command, helpText: string): Command {
  // Apply custom help formatter that avoids duplication
  command.helpInformation = function () {
    const name = command.name();
    const args = command.usage();
    const description = command.description();

    // Create a minimal header
    let header = `\nUsage: ph ${name}`;
    if (args) header += ` ${args}`;
    if (description) header += `\n\n${description}\n`;

    // Return the custom help text
    return header + "\n" + helpText;
  };

  return command;
}

/**
 * Updates the styles.css file to include imports for newly installed packages
 * @param dependencies - Array of dependencies that were installed
 * @param projectPath - Path to the project root
 */
export function updateStylesFile(
  dependencies: { name: string; version: string | undefined; full: string }[],
  projectPath: string,
) {
  const stylesPath = path.join(projectPath, "style.css");

  // Check if styles.css exists
  if (!fs.existsSync(stylesPath)) {
    console.warn("⚠️ Warning: style.css file not found in project root");
    return;
  }

  const currentStyles = fs.readFileSync(stylesPath, "utf-8");
  let updatedStyles = currentStyles;

  for (const dep of dependencies) {
    const cssPath = `./node_modules/${dep.name}/dist/style.css`;
    const fullCssPath = path.join(projectPath, cssPath);
    const importStatement = `@import '${cssPath}';`;

    // Check if the CSS file exists
    if (!fs.existsSync(fullCssPath)) {
      console.warn(`⚠️ Warning: CSS file not found at ${cssPath}`);
      continue;
    }

    // Check if import already exists
    if (currentStyles.includes(importStatement)) {
      continue;
    }

    // Find the last @import statement
    const importLines = currentStyles
      .split("\n")
      .filter((line) => line.trim().startsWith("@import"));
    const lastImport = importLines[importLines.length - 1];

    if (lastImport) {
      // Insert new import after the last existing import
      updatedStyles = currentStyles.replace(
        lastImport,
        `${lastImport}\n${importStatement}`,
      );
    } else {
      // If no imports exist, add at the top of the file
      updatedStyles = `${importStatement}\n${currentStyles}`;
    }
  }

  // Only write if changes were made
  if (updatedStyles !== currentStyles) {
    fs.writeFileSync(stylesPath, updatedStyles);
  }
}

/**
 * Removes CSS imports for uninstalled packages from styles.css
 */
export function removeStylesImports(
  dependencies: { name: string; version: string | undefined; full: string }[],
  projectPath: string,
) {
  const stylesPath = path.join(projectPath, "style.css");

  // Check if styles.css exists
  if (!fs.existsSync(stylesPath)) {
    console.warn("⚠️ Warning: style.css file not found in project root");
    return;
  }

  const currentStyles = fs.readFileSync(stylesPath, "utf-8");
  let updatedStyles = currentStyles;

  for (const dep of dependencies) {
    const cssPath = `./node_modules/${dep.name}/dist/style.css`;
    const importStatement = `@import '${cssPath}';`;

    // Remove the import line if it exists
    const lines = updatedStyles.split("\n");
    const filteredLines = lines.filter(
      (line) => !line.trim().includes(importStatement),
    );

    if (filteredLines.length !== lines.length) {
      updatedStyles = filteredLines.join("\n");
    }
  }

  // Only write if changes were made
  if (updatedStyles !== currentStyles) {
    fs.writeFileSync(stylesPath, updatedStyles);
  }
}

export { getConfig } from "@powerhousedao/config/utils";
