import { type Command } from "commander";
import { readFileSync } from "node:fs";
import path from "node:path";
import { useHelp } from "../help.js";
import { type CommandActionType } from "../types.js";
import {
  getPackageManagerFromLockfile,
  getProjectInfo,
  installDependency,
  type PackageManager,
  resolvePackageManagerOptions,
  updateDependencyVersionString,
  withCustomHelp,
} from "../utils/index.js";

export const ORG = "@powerhousedao";

// Special packages that don't use the @powerhousedao organization
export const SPECIAL_PACKAGES = ["document-model", "document-drive"];

// Dynamically list all packages, clis, and apps
export const PACKAGES = [
  "common",
  "design-system",
  "reactor-browser",
  "builder-tools",
  "codegen",
  "reactor-api",
  "reactor-local",
  "scalars",
  "switchboard-gui",
  "renown",
  "config",
  "switchboard",
  ...SPECIAL_PACKAGES,
];

export const CLIS = ["ph-cli", "ph-cmd"];

export const APPS = ["switchboard", "connect"];

export const PH_PROJECT_DEPENDENCIES = [
  ...PACKAGES.filter((pkg) => !SPECIAL_PACKAGES.includes(pkg)).map(
    (dependency) => `${ORG}/${dependency}`,
  ),
  ...SPECIAL_PACKAGES,
  ...CLIS.map((dependency) => `${ORG}/${dependency}`),
  ...APPS.map((dependency) => `${ORG}/${dependency}`),
];

export const PH_PROJECT_LOCAL_DEPENDENCIES = [
  ...PACKAGES.map((dependency) => path.join("packages", dependency)),
  ...CLIS.map((dependency) => path.join("clis", dependency)),
  ...APPS.map((dependency) => path.join("apps", dependency)),
];

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

  const existingDependencies = {
    ...(packageJson.dependencies || {}),
    ...(packageJson.devDependencies || {}),
  };

  const dependencies: string[] = [];

  if (localPath) {
    // For local path, only include dependencies that exist in package.json
    PH_PROJECT_LOCAL_DEPENDENCIES.forEach((dependency) => {
      const fullPath = path.join(localPath, dependency);
      const packageName = path.basename(dependency);
      const depName = SPECIAL_PACKAGES.includes(packageName)
        ? packageName
        : `${ORG}/${packageName}`;
      if (existingDependencies[depName]) {
        dependencies.push(fullPath);
      }
    });
  } else {
    // For remote dependencies, only include those that exist in package.json
    PH_PROJECT_DEPENDENCIES.forEach((dependency) => {
      if (existingDependencies[dependency]) {
        dependencies.push(`${dependency}@${ENV_MAP[env]}`);
      }
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
    },
  );
}
