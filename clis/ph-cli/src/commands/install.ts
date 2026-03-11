import {
  getPowerhouseProjectInfo,
  getPowerhouseProjectInstallCommand,
  installArgs,
  makeDependenciesWithVersions,
} from "@powerhousedao/common/clis";
import { execSync } from "child_process";
import { command } from "cmd-ts";
import { updateConfigFile, updateStylesFile } from "../utils.js";

export const install = command({
  name: "install",
  aliases: ["add", "i"],
  description: `
The install command adds Powerhouse dependencies to your project. By default it only
updates powerhouse.config.json with the package as a registry dependency (no npm install).

Use --local to also install the package as a node module from the registry.

This command:
1. Updates powerhouse.config.json to include the new dependencies with provider "registry"
2. Sets registryUrl in config if not already set
3. With --local: also installs via package manager and updates style.css
  `,
  args: installArgs,
  handler: async (args) => {
    if (args.debug) {
      console.log(args);
    }

    const {
      projectPath,
      localProjectPath,
      globalProjectPath,
      packageManager,
      isGlobal,
    } = await getPowerhouseProjectInfo(args);

    if (!projectPath) {
      throw new Error(`Could not find project path to install from.`);
    }

    const dependenciesWithVersions = await makeDependenciesWithVersions(
      args.dependencies,
    );

    if (args.debug) {
      console.log(">>> parsedDependencies", dependenciesWithVersions);
    }

    if (args.debug) {
      console.log("\n>>> projectInfo", {
        localProjectPath,
        globalProjectPath,
        packageManager,
        isGlobal,
      });
    }

    // Always update config file (registry-based entry)
    if (args.debug) {
      console.log("\n>>> updateConfigFile arguments:");
      console.log(">>> dependencies", args.dependencies);
      console.log(">>> projectPath", projectPath);
    }

    try {
      console.log("⚙️ Updating powerhouse config file...");
      updateConfigFile(dependenciesWithVersions, projectPath, "install");
      console.log("Config file updated successfully 🎉");
    } catch (error) {
      console.error("❌ Failed to update config file");
      throw error;
    }

    // With --local flag: also install as node module and update styles
    if (args.local) {
      try {
        console.log("installing dependencies 📦 ...");
        const installCommand =
          getPowerhouseProjectInstallCommand(packageManager);
        execSync(installCommand, {
          stdio: "inherit",
          cwd: projectPath,
        });
        console.log("Dependency installed successfully 🎉");
      } catch (error) {
        console.error("❌ Failed to install dependencies");
        throw error;
      }

      try {
        console.log("⚙️ Updating styles.css file...");
        updateStylesFile(dependenciesWithVersions, projectPath);
        console.log("Styles file updated successfully 🎉");
      } catch (error) {
        console.error("❌ Failed to update styles file");
        throw error;
      }
    }

    process.exit(0);
  },
});
