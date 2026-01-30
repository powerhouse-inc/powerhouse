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
The install command adds Powerhouse dependencies to your project. It handles installation
of packages, updates configuration files, and ensures proper setup of dependencies.

This command:
1. Installs specified Powerhouse dependencies using your package manager
2. Updates powerhouse.config.json to include the new dependencies
3. Supports various installation options and configurations
4. Works with npm, yarn, pnpm, and bun package managers
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
      console.log("installing dependencies 📦 ...");
      const installCommand = getPowerhouseProjectInstallCommand(packageManager);
      execSync(installCommand, {
        stdio: "inherit",
        cwd: projectPath,
      });
      console.log("Dependency installed successfully 🎉");
    } catch (error) {
      console.error("❌ Failed to install dependencies");
      throw error;
    }

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

    try {
      console.log("⚙️ Updating styles.css file...");
      updateStylesFile(dependenciesWithVersions, projectPath);
      console.log("Styles file updated successfully 🎉");
    } catch (error) {
      console.error("❌ Failed to update styles file");
      throw error;
    }

    process.exit(0);
  },
});
