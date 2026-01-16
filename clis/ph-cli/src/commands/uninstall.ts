import { execSync } from "child_process";
import { command, restPositionals, string } from "cmd-ts";
import { AGENTS } from "package-manager-detector";
import { removeStylesImports, updateConfigFile } from "../utils.js";
import {
  getPowerhouseProjectInfo,
  getPowerhouseProjectUninstallCommand,
  makeDependenciesWithVersions,
} from "../utils/projects.js";
import { debugArgs, packageManagerArgs } from "./common-args.js";

export const uninstallArgs = {
  dependencies: restPositionals({
    type: string,
    displayName: "dependencies",
    description: "Names of the dependencies to uninstall",
  }),
  ...packageManagerArgs,
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
4. Works with ${AGENTS.join(", ")} package managers
`,
  args: uninstallArgs,
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

    try {
      console.log("Uninstalling dependencies 📦 ...");
      const uninstallCommand =
        await getPowerhouseProjectUninstallCommand(packageManager);
      execSync(uninstallCommand, {
        stdio: "inherit",
        cwd: projectPath,
      });
      console.log("Dependency uninstalled successfully 🎉");
    } catch (error) {
      console.error("❌ Failed to uninstall dependencies");
      throw error;
    }

    try {
      console.log("⚙️ Updating powerhouse config file...");
      updateConfigFile(dependenciesWithVersions, projectPath, "uninstall");
      console.log("Config file updated successfully 🎉");
    } catch (error) {
      console.error("❌ Failed to update config file");
      throw error;
    }

    try {
      console.log("⚙️ Updating styles.css file...");
      removeStylesImports(dependenciesWithVersions, projectPath);
      console.log("Styles file updated successfully 🎉");
    } catch (error) {
      console.error("❌ Failed to update styles file");
      throw error;
    }
  },
});
