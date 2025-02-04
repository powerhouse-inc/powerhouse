import fs from "node:fs";
import { execSync } from "node:child_process";
import { Command } from "commander";

import { CommandActionType } from "../types.js";
import {
  PackageManager,
  packageManagers,
  SUPPORTED_PACKAGE_MANAGERS,
  getProjectInfo,
  getPackageManagerFromLockfile,
  updateConfigFile,
} from "../utils.js";

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

export const install: CommandActionType<
  [
    string[] | undefined,
    {
      debug?: boolean;
      global?: boolean;
      workspace?: boolean;
      packageManager?: string;
    },
  ]
> = (dependencies, options) => {
  if (options.debug) {
    console.log(">>> command arguments", { dependencies, options });
  }

  if (!dependencies || dependencies.length === 0) {
    throw new Error("❌ Dependency name is required");
  }

  if (
    options.packageManager &&
    !SUPPORTED_PACKAGE_MANAGERS.includes(options.packageManager)
  ) {
    throw new Error(
      "❌ Unsupported package manager. Supported package managers: npm, yarn, pnpm, bun",
    );
  }

  const projectInfo = getProjectInfo(options.debug);

  if (options.debug) {
    console.log("\n>>> projectInfo", projectInfo);
  }

  const isGlobal = options.global || projectInfo.isGlobal;
  const packageManager =
    options.packageManager || getPackageManagerFromLockfile(projectInfo.path);

  if (options.debug) {
    console.log("\n>>> installDependency arguments:");
    console.log(">>> packageManager", packageManager);
    console.log(">>> dependencies", dependencies);
    console.log(">>> isGlobal", isGlobal);
    console.log(">>> projectPath", projectInfo.path);
    console.log(">>> workspace", options.workspace);
  }

  try {
    console.log("installing dependencies 📦 ...");
    installDependency(
      packageManager as PackageManager,
      dependencies,
      projectInfo.path,
      options.workspace,
    );
    console.log("Dependency installed successfully 🎉");
  } catch (error) {
    console.error("❌ Failed to install dependencies");
    throw error;
  }

  if (options.debug) {
    console.log("\n>>> updateConfigFile arguments:");
    console.log(">>> dependencies", dependencies);
    console.log(">>> projectPath", projectInfo.path);
  }

  try {
    console.log("⚙️ Updating powerhouse config file...");
    updateConfigFile(dependencies, projectInfo.path, "install");
    console.log("Config file updated successfully 🎉");
  } catch (error) {
    console.error("❌ Failed to update config file");
    throw error;
  }
};

export function installCommand(program: Command) {
  program
    .command("install")
    .description("Install a powerhouse dependency")
    .argument("[dependencies...]", "Names of the dependencies to install")
    .option("-g, --global", "Install the dependency globally")
    .option("--debug", "Show additional logs")
    .option(
      "-w, --workspace",
      "Install the dependency in the workspace (use this option for monorepos)",
    )
    .option(
      "--package-manager <packageManager>",
      "force package manager to use",
    )
    .action(install);
}
