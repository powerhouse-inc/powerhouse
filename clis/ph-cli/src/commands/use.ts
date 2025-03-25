import { type Command } from "commander";
import path from "node:path";
import { type CommandActionType } from "../types.js";
import {
  getPackageManagerFromLockfile,
  getProjectInfo,
  type PackageManager,
} from "../utils.js";
import { installDependency } from "./install.js";

export const ORG = "@powerhousedao";
export const CLIS = ["ph-cli"];
export const PACKAGES = [
  "common",
  "design-system",
  "reactor-browser",
  "builder-tools",
  "codegen",
  "reactor-api",
  "reactor-local",
  "scalars",
];

export const PH_PROJECT_DEPENDENCIES = [
  ...PACKAGES.map((dependency) => `${ORG}/${dependency}`),
  ...CLIS.map((dependency) => `${ORG}/${dependency}`),
];

export const PH_PROJECT_LOCAL_DEPENDENCIES = [
  ...PACKAGES.map((dependency) => path.join("packages", dependency)),
  ...CLIS.map((dependency) => path.join("clis", dependency)),
];

export const ENV_MAP = {
  dev: "dev",
  prod: "latest",
  latest: "latest",
};

// create type with the keys of ENV_MAP
export type Environment = keyof typeof ENV_MAP;

export const updatePackageJson = (
  env: Environment,
  localPath?: string,
  packageManager?: PackageManager,
  debug?: boolean,
) => {
  const dependencies: string[] = [];
  const projectInfo = getProjectInfo();

  const pkgManager =
    packageManager || getPackageManagerFromLockfile(projectInfo.path);

  if (debug) {
    console.log(">>> projectInfo", projectInfo);
    console.log(">>> pkgManager", pkgManager);
  }

  if (localPath) {
    const localPathDependencies = PH_PROJECT_LOCAL_DEPENDENCIES.map(
      (dependency) => path.join(localPath, dependency),
    );

    dependencies.push(...localPathDependencies);
  } else {
    dependencies.push(
      ...PH_PROJECT_DEPENDENCIES.map(
        (dependency) => `${dependency}@${ENV_MAP[env]}`,
      ),
    );
  }

  if (debug) {
    console.log(">>> dependencies", dependencies);
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
    {
      dev?: boolean;
      prod?: boolean;
      local?: string;
      debug?: boolean;
      latest?: boolean;
      packageManager?: string;
    },
  ]
> = (options) => {
  const { dev, prod, latest, local, packageManager, debug } = options;

  const develop: Environment | null = dev ? "dev" : null;
  const production: Environment | null = prod ? "prod" : null;
  const latestEnv: Environment | null = latest ? "latest" : null;

  const env: Environment | null = develop || production || latestEnv;

  if (debug) {
    console.log(">>> options", options);
  }

  if (!env && !local) {
    throw new Error("❌ Please specify an environment");
  }

  updatePackageJson(
    env || "dev",
    local,
    packageManager as PackageManager,
    debug,
  );
};

export function useCommand(program: Command) {
  program
    .command("use")
    .description(
      "Allows you to change your environment (latest, development, production, local)",
    )
    .option("-d, --dev", "Use development environment")
    .option("-p, --prod", "Use production environment")
    .option("--latest", "Use latest environment")
    .option(
      "-l, --local <localPath>",
      "Use local environment (you have to specify the path to the local environment)",
    )
    .option(
      "--package-manager <packageManager>",
      "force package manager to use",
    )
    .option("--debug", "Show additional logs")
    .action(use);
}
