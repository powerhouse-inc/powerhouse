import { execSync } from "child_process";
import {
  boolean,
  command,
  flag,
  option,
  optional,
  restPositionals,
  string,
} from "cmd-ts";
import fs from "node:fs";
import {
  getPackageManagerFromLockfile,
  getProjectInfo,
  type PackageManager,
  packageManagers,
  removeStylesImports,
  SUPPORTED_PACKAGE_MANAGERS,
  updateConfigFile,
} from "../utils.js";
import { debugArgs } from "./common-args.js";

export const uninstallArgs = {
  dependencies: restPositionals({
    type: string,
    displayName: "dependencies",
    description: "Names of the dependencies to uninstall",
  }),
  packageManager: option({
    type: optional(string),
    long: "package-manager",
    description: "Force package manager to use",
  }),
  global: flag({
    type: optional(boolean),
    long: "global",
    short: "g",
    description: "Uninstall the dependency globally",
  }),
  workspace: flag({
    type: optional(boolean),
    long: "workspace",
    short: "w",
    description:
      "Uninstall the dependency in the workspace (use this option for monorepos)",
  }),
  ...debugArgs,
};

export const uninstall = command({
  name: "uninstall",
  aliases: ["remove"],
  description: `
The uninstall command removes Powerhouse dependencies from your project. It handles the
removal of packages, updates configuration files, and ensures proper cleanup.

This command:
1. Uninstalls specified Powerhouse dependencies using your package manager
2. Updates powerhouse.config.json to remove the dependencies
3. Supports various uninstallation options and configurations
4. Works with npm, yarn, pnpm, and bun package managers
`,
  args: uninstallArgs,
  handler: (args) => {
    if (args.debug) {
      console.log(args);
    }

    const { dependencies } = args;

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

    if (args.debug) {
      console.log(">>> parsedDependencies", parsedDependencies);
    }

    if (
      args.packageManager &&
      !SUPPORTED_PACKAGE_MANAGERS.includes(args.packageManager)
    ) {
      throw new Error(
        "❌ Unsupported package manager. Supported package managers: npm, yarn, pnpm, bun",
      );
    }

    const projectInfo = getProjectInfo(args.debug);

    if (args.debug) {
      console.log("\n>>> projectInfo", projectInfo);
    }

    const isGlobal = args.global || projectInfo.isGlobal;
    const packageManager =
      args.packageManager || getPackageManagerFromLockfile(projectInfo.path);

    if (args.debug) {
      console.log("\n>>> uninstallDependency arguments:");
      console.log(">>> packageManager", packageManager);
      console.log(">>> dependencies", dependencies);
      console.log(">>> isGlobal", isGlobal);
      console.log(">>> projectPath", projectInfo.path);
      console.log(">>> workspace", args.workspace);
    }

    try {
      console.log("Uninstalling dependencies 📦 ...");
      uninstallDependency(
        packageManager as PackageManager,
        parsedDependencies.map((dep) => dep.name),
        projectInfo.path,
        args.workspace,
      );
      console.log("Dependency uninstalled successfully 🎉");
    } catch (error) {
      console.error("❌ Failed to uninstall dependencies");
      throw error;
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
  },
});

function uninstallDependency(
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
