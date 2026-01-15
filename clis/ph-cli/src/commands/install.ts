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
import { installHelp } from "../help.js";
import {
  SUPPORTED_PACKAGE_MANAGERS,
  getPackageManagerFromLockfile,
  getProjectInfo,
  updateConfigFile,
  updateStylesFile,
  type PackageManager,
} from "../utils.js";
import { debugArgs } from "./common-args.js";
import { installDependency } from "./install.old.js";

export const installDescription = "Install a powerhouse dependency";

export const installArgs = {
  dependencies: restPositionals({
    type: string,
    displayName: "[dependencies...]",
    description: "Names of the dependencies to install",
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
    description: "Install the dependency globally",
  }),
  workspace: flag({
    type: optional(boolean),
    long: "workspace",
    short: "w",
    description:
      "Install the dependency in the workspace (use this option for monorepos)",
  }),
  help: flag({
    type: optional(boolean),
    long: "help",
    short: "h",
    description: "Show help for this command",
  }),
  ...debugArgs,
};

export const install = command({
  name: "install",
  aliases: ["add", "i"],
  description: installDescription,
  args: installArgs,
  handler: async (args) => {
    if (args.debug) {
      console.log(args);
    }

    if (args.help) {
      console.log(installHelp);
      process.exit(0);
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
      console.log("\n>>> installDependency arguments:");
      console.log(">>> packageManager", packageManager);
      console.log(">>> dependencies", dependencies);
      console.log(">>> isGlobal", isGlobal);
      console.log(">>> projectPath", projectInfo.path);
      console.log(">>> workspace", args.workspace);
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
        args.workspace,
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

    if (args.debug) {
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
  },
});
