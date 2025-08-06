import { type Command } from "commander";
import { execSync } from "node:child_process";
import fs from "node:fs";

import { uninstallHelp } from "../help.js";
import { type CommandActionType } from "../types.js";
import {
  getPackageManagerFromLockfile,
  getProjectInfo,
  type PackageManager,
  packageManagers,
  removeStylesImports,
  setCustomHelp,
  SUPPORTED_PACKAGE_MANAGERS,
  updateConfigFile,
} from "../utils.js";

export function uninstallDependency(
  packageManager: PackageManager,
  dependencies: string[],
  projectPath: string,
  workspace?: boolean,
) {
  if (!fs.existsSync(projectPath)) {
    throw new Error(`Project path not found: ${projectPath}`);
  }

  const manager = packageManagers[packageManager];

  let uninstallCommand = manager.uninstallCommand.replace(
    "{{dependency}}",
    dependencies.join(" "),
  );

  if (workspace) {
    uninstallCommand += ` ${manager.workspaceOption}`;
  }

  const commandOptions = { cwd: projectPath };

  execSync(uninstallCommand, {
    stdio: "inherit",
    ...commandOptions,
  });
}

export const uninstall: CommandActionType<
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

  // Parse package names to extract version/tag
  const parsedDependencies = dependencies.map((dep) => {
    // Handle scoped packages (@org/package[@version])
    if (dep.startsWith("@")) {
      const matches = /^(@[^/]+\/[^@]+)(?:@(.+))?$/.exec(dep);
      if (!matches) {
        throw new Error(`Invalid scoped package name format: ${dep}`);
      }
      return {
        name: matches[1],
        version: matches[2] || "latest",
        full: dep,
      };
    }

    // Handle regular packages (package[@version])
    const matches = /^([^@]+)(?:@(.+))?$/.exec(dep);
    if (!matches) {
      throw new Error(`Invalid package name format: ${dep}`);
    }
    return {
      name: matches[1],
      version: matches[2] || "latest",
      full: dep,
    };
  });

  if (options.debug) {
    console.log(">>> parsedDependencies", parsedDependencies);
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
    console.log("\n>>> uninstallDependency arguments:");
    console.log(">>> packageManager", packageManager);
    console.log(">>> dependencies", dependencies);
    console.log(">>> isGlobal", isGlobal);
    console.log(">>> projectPath", projectInfo.path);
    console.log(">>> workspace", options.workspace);
  }

  try {
    console.log("Uninstalling dependencies 📦 ...");
    uninstallDependency(
      packageManager as PackageManager,
      parsedDependencies.map((dep) => dep.name),
      projectInfo.path,
      options.workspace,
    );
    console.log("Dependency uninstalled successfully 🎉");
  } catch (error) {
    console.error("❌ Failed to uninstall dependencies");
    throw error;
  }

  if (options.debug) {
    console.log("\n>>> updateConfigFile arguments:");
    console.log(">>> dependencies", dependencies);
    console.log(">>> projectPath", projectInfo.path);
    console.log(">>> task", "uninstall");
  }

  try {
    console.log("⚙️ Updating powerhouse config file...");
    updateConfigFile(parsedDependencies, projectInfo.path, "uninstall");
    console.log("Config file updated successfully 🎉");
  } catch (error) {
    console.error("❌ Failed to update config file");
    throw error;
  }

  try {
    console.log("⚙️ Updating styles.css file...");
    removeStylesImports(parsedDependencies, projectInfo.path);
    console.log("Styles file updated successfully 🎉");
  } catch (error) {
    console.error("❌ Failed to update styles file");
    throw error;
  }
};

export function uninstallCommand(program: Command) {
  const command = program
    .command("uninstall")
    .alias("remove")
    .description("Uninstall a powerhouse dependency")
    .argument("[dependencies...]", "Names of the dependencies to remove")
    .option("-g, --global", "Remove the dependency globally")
    .option("--debug", "Show additional logs")
    .option(
      "-w, --workspace",
      "Uninstall the dependency in the workspace (use this option for monorepos)",
    )
    .option(
      "--package-manager <packageManager>",
      "force package manager to use",
    )
    .action(uninstall);

  setCustomHelp(command, uninstallHelp);
}
