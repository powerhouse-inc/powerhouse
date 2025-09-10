import type { Command } from "commander";
import { readFileSync } from "node:fs";
import path from "node:path";
import { useHelp } from "../help.js";
import type { CommandActionType } from "../types.js";
import type { PackageManager } from "../utils/index.js";
import {
  getPackageManagerFromLockfile,
  getProjectInfo,
  installDependency,
  resolvePackageManagerOptions,
  updateDependencyVersionString,
  withCustomHelp,
} from "../utils/index.js";

export const ORG = "@powerhousedao";

// Special packages that don't use the @powerhousedao organization
export const SPECIAL_PACKAGES = [
  "document-model",
  "document-drive",
  "@renown/sdk",
];

// Packages to exclude from dynamic detection (external dependencies)
export const EXCLUDED_PACKAGES = [
  "@powerhousedao/document-engineering",
  "@powerhousedao/diff-analyzer",
  "@powerhousedao/analytics-engine-core",
  "@powerhousedao/analytics-engine-graphql",
  "@powerhousedao/analytics-engine-pg",
  "@powerhousedao/analytics-engine-browser",
  "@powerhousedao/analytics-engine-knex",
];

/**
 * Detects all Powerhouse packages from package.json dependencies
 * @param packageJson - The parsed package.json object
 * @returns Array of package names to process
 */
export function detectPowerhousePackages(packageJson: {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}): string[] {
  const allDependencies = {
    ...(packageJson.dependencies || {}),
    ...(packageJson.devDependencies || {}),
  };

  const powerhousePackages: string[] = [];

  // Find all @powerhousedao packages (excluding document-engineering)
  Object.keys(allDependencies).forEach((dep) => {
    if (dep.startsWith(ORG + "/") && !EXCLUDED_PACKAGES.includes(dep)) {
      powerhousePackages.push(dep);
    }
  });

  // Add special packages if they exist
  SPECIAL_PACKAGES.forEach((pkg) => {
    if (allDependencies[pkg]) {
      powerhousePackages.push(pkg);
    }
  });

  return powerhousePackages;
}

/**
 * Maps a package name to its monorepo directory path by reading package.json files
 * @param packageName - The package name (e.g., '@powerhousedao/common' or 'document-model')
 * @param localPath - The base path to the monorepo
 * @returns The full path to the package directory
 */
export function mapPackageToMonorepoPath(
  packageName: string,
  localPath: string,
): string {
  // Search in all possible locations
  const searchDirs = [
    path.join(localPath, "packages"),
    path.join(localPath, "apps"),
    path.join(localPath, "clis"),
  ];

  for (const searchDir of searchDirs) {
    if (!existsSync(searchDir)) continue;

    try {
      // Read all subdirectories
      const subdirs = readdirSync(searchDir, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name);

      // Check each subdirectory's package.json
      for (const subdir of subdirs) {
        const packageJsonPath = path.join(searchDir, subdir, "package.json");
        if (existsSync(packageJsonPath)) {
          try {
            const content = readFileSync(packageJsonPath, "utf-8");
            const pkg = JSON.parse(content) as { name?: string };
            if (pkg.name === packageName) {
              return path.join(searchDir, subdir);
            }
          } catch {
            // Ignore invalid package.json files
          }
        }
      }
    } catch {
      // Ignore errors reading directory
      continue;
    }
  }

  // Fallback to old behavior if not found
  const baseName = packageName.startsWith(ORG + "/")
    ? packageName.substring(ORG.length + 1)
    : packageName;
  return path.join(localPath, "packages", baseName);
}

export const ENV_MAP = {
  dev: "dev",
  staging: "staging",
  prod: "latest",
  latest: "latest",
};

// create type with the keys of ENV_MAP
export type Environment = keyof typeof ENV_MAP;

export const updatePackageJson = async (
  env: Environment,
  localPath?: string,
  packageManager?: PackageManager,
  debug?: boolean,
  useResolved?: boolean,
) => {
  const projectInfo = await getProjectInfo();
  const pkgManager =
    packageManager || getPackageManagerFromLockfile(projectInfo.path);

  if (debug) {
    console.log(">>> projectInfo", projectInfo);
    console.log(">>> pkgManager", pkgManager);
  }

  // Read the project's package.json
  const packageJsonPath = path.join(projectInfo.path, "package.json");
  const packageJsonContent = readFileSync(packageJsonPath, "utf-8");
  const packageJson = JSON.parse(packageJsonContent) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  // Detect all Powerhouse packages from the current package.json
  const powerhousePackages = detectPowerhousePackages(packageJson);

  const dependencies: string[] = [];

  if (localPath) {
    // For local path, map each detected package to its monorepo path
    powerhousePackages.forEach((packageName) => {
      const fullPath = mapPackageToMonorepoPath(packageName, localPath);
      dependencies.push(fullPath);
    });
  } else {
    // For remote dependencies, add version tags
    powerhousePackages.forEach((packageName) => {
      dependencies.push(`${packageName}@${ENV_MAP[env]}`);
    });
  }

  if (debug) {
    console.log(">>> dependencies to update", dependencies);
  }

  if (dependencies.length === 0) {
    console.log("ℹ️ No Powerhouse dependencies found to update");
    return;
  }

  try {
    console.log("⚙️ Updating dependencies...");
    if (localPath || useResolved) {
      installDependency(pkgManager, dependencies, projectInfo.path);
    } else {
      updateDependencyVersionString(pkgManager, dependencies, projectInfo.path);
    }
    console.log("✅ Dependencies updated successfully");
  } catch (error) {
    console.error("❌ Failed to update dependencies");
    throw error;
  }
};

// Extract the type parameters for reuse
export type UseOptions = {
  dev?: boolean;
  prod?: boolean;
  local?: string;
  debug?: boolean;
  latest?: boolean;
  force?: boolean;
  packageManager?: string;
  pnpm?: boolean;
  yarn?: boolean;
  bun?: boolean;
  useResolved?: boolean;
};

export const use: CommandActionType<
  [string | undefined, string | undefined, UseOptions]
> = async (environment, localPath, options) => {
  if (
    !environment ||
    (!options.force &&
      environment !== "local" &&
      !Object.keys(ENV_MAP).includes(environment))
  ) {
    throw new Error(
      `❌ Invalid environment, use --force or use one of the following: ${Object.keys(ENV_MAP).join(", ")}`,
    );
  }

  if (environment === "local" && !localPath) {
    throw new Error(
      "❌ Local environment requires a local path, please specify the path to the local environment",
    );
  }

  const { debug } = options;

  const env = environment as Environment;

  if (debug) {
    console.log(">>> options", options);
  }

  const projectInfo = await getProjectInfo();
  const packageManager =
    resolvePackageManagerOptions(options) ??
    getPackageManagerFromLockfile(projectInfo.path);

  await updatePackageJson(
    env,
    localPath,
    packageManager as PackageManager,
    debug,
    options.useResolved,
  );
};

export function useCommand(program: Command): Command {
  const useCmd = program
    .command("use")
    .description(
      "Allows you to change your environment (latest, development, production, local)",
    )
    .argument(
      "[environment]",
      "The environment to use (latest, dev, prod, local)",
    )
    .argument(
      "[localPath]",
      "The path to the local environment (you have to specify the path to the local environment)",
    )
    .option("--force", "force environment to use")
    .option("--use-resolved", "Use resolved dependency versions")
    .option("--package-manager <packageManager>", "package manager to be used")
    .option("--pnpm", "Use 'pnpm' as package manager")
    .option("--yarn", "Use 'yarn' as package manager")
    .option("--bun", "Use 'bun' as package manager")
    .option("--debug", "Show additional logs");

  // Use withCustomHelp instead of withHelpAction and addHelpText
  return withCustomHelp<[string | undefined, string | undefined, UseOptions]>(
    useCmd,
    use,
    useHelp,
    // Pre-check function to validate environment before running the action
    (environment) => {
      if (
        !environment &&
        !process.argv.includes("--help") &&
        !process.argv.includes("-h")
      ) {
        console.error('Error: Missing required argument "environment"');
        process.exit(1);
        return false;
      }
      return true;
    },
  );
}
