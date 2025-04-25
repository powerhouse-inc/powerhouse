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
    installDependency(pkgManager, dependencies, projectInfo.path);
    console.log("✅ Dependencies updated successfully");
  } catch (error) {
    console.error("❌ Failed to update dependencies");
    throw error;
  }
};

export const use: CommandActionType<
  [
    string | undefined,
    string | undefined,
    {
      dev?: boolean;
      prod?: boolean;
      local?: string;
      debug?: boolean;
      latest?: boolean;
      force?: boolean;
      packageManager?: string;
    },
  ]
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

  const { packageManager, debug } = options;

  const env = environment as Environment;

  if (debug) {
    console.log(">>> options", options);
  }

  await updatePackageJson(
    env,
    localPath,
    packageManager as PackageManager,
    debug,
  );
};

export function useCommand(program: Command) {
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
    .option(
      "--package-manager <packageManager>",
      "force package manager to use",
    )
    .option("--debug", "Show additional logs")
    .addHelpText("after", useHelp);

  useCmd.action((environment, localPath, options) => {
    // Check raw arguments to see if help was requested
    const rawArgs = process.argv;
    const isHelpRequested =
      rawArgs.includes("--help") || rawArgs.includes("-h");

    // If help was explicitly requested, show the full command help
    if (isHelpRequested) {
      useCmd.outputHelp();
      process.exit(0);
    }

    // If no environment, show error and usage
    if (!environment) {
      console.error('Error: Missing required argument "environment"');
      process.exit(1);
    }

    // Run the original action function
    return use(environment, localPath, options);
  });
}
