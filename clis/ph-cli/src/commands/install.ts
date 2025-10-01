import type { Command } from "commander";
import { execSync } from "node:child_process";
import fs from "node:fs";
import type { CommandActionType, PackageManager } from "@powerhousedao/ph-cli";
import {
  getPackageManagerFromLockfile,
  getProjectInfo,
  installHelp,
  packageManagers,
  setCustomHelp,
  SUPPORTED_PACKAGE_MANAGERS,
  updateConfigFile,
  updateStylesFile,
} from "@powerhousedao/ph-cli";

export function installDependency(
  packageManager: PackageManager,
  dependencies: string[],
  projectPath: string,
  workspace?: boolean,
) {
  return buildInstallCommand(packageManager, dependencies, workspace);
}

export function buildInstallCommand(
  packageManager: PackageManager,
  dependencies: string[],
  workspace?: boolean,
): string {
  const manager = packageManagers[packageManager];

  let installCommand = manager.installCommand.replace(
    "{{dependency}}",
    dependencies.join(" "),
  );

  if (workspace) {
    installCommand += ` ${manager.workspaceOption}`;
  }

  return installCommand;
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
    if (!fs.existsSync(projectInfo.path)) {
      throw new Error(`Project path not found: ${projectInfo.path}`);
    }
    const installCommand = installDependency(
      packageManager as PackageManager,
      parsedDependencies.map((dep) => dep.full),
      projectInfo.path,
      options.workspace,
    );
    const commandOptions = { cwd: projectInfo.path };
    execSync(installCommand, {
      stdio: "inherit",
      ...commandOptions,
    });
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
    updateConfigFile(parsedDependencies, projectInfo.path, "install");
    console.log("Config file updated successfully 🎉");
  } catch (error) {
    console.error("❌ Failed to update config file");
    throw error;
  }

  try {
    console.log("⚙️ Updating styles.css file...");
    updateStylesFile(parsedDependencies, projectInfo.path);
    console.log("Styles file updated successfully 🎉");
  } catch (error) {
    console.error("❌ Failed to update styles file");
    throw error;
  }
};

export function installCommand(program: Command) {
  const command = program
    .command("install")
    .alias("add")
    .alias("i")
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

  setCustomHelp(command, installHelp);
}
