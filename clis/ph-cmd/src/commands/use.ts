import { type Command } from "commander";
import path from "node:path";
import { type CommandActionType } from "../types.js";
import {
  getPackageManagerFromLockfile,
  getProjectInfo,
  installDependency,
  type PackageManager,
} from "../utils.js";

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
    string | undefined,
    string | undefined,
    {
      dev?: boolean;
      prod?: boolean;
      local?: string;
      debug?: boolean;
      latest?: boolean;
      packageManager?: string;
    },
  ]
> = (environment, localPath, options) => {
  if (
    !environment ||
    (environment !== "local" && !Object.keys(ENV_MAP).includes(environment))
  ) {
    throw new Error(
      "❌ Invalid environment, please use one of the following: latest, dev, prod, local",
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

  updatePackageJson(env, localPath, packageManager as PackageManager, debug);
};

export function useCommand(program: Command) {
  program
    .command("use")
    .description(
      "Allows you to change your environment (latest, development, production, local)",
    )
    .argument(
      "<environment>",
      "The environment to use (latest, dev, prod, local)",
    )
    .argument(
      "[localPath]",
      "The path to the local environment (you have to specify the path to the local environment)",
    )
    .option(
      "--package-manager <packageManager>",
      "force package manager to use",
    )
    .option("--debug", "Show additional logs")
    .action(use);
}
