import { DEFAULT_REGISTRY_URL } from "@powerhousedao/config";
import { getConfig } from "@powerhousedao/config/node";
import {
  getPowerhouseProjectInfo,
  getPowerhouseProjectInstallCommand,
  installArgs,
  makeDependenciesWithVersions,
} from "@powerhousedao/shared/clis";
import { execSync } from "child_process";
import { command } from "cmd-ts";
import { join } from "path";
import { updateConfigFile, updateStylesFile } from "../utils.js";

export const install = command({
  name: "install",
  aliases: ["add", "i"],
  description: `
The install command adds Powerhouse dependencies to your project. It installs packages
from the Powerhouse registry by default and updates configuration files.

This command:
1. Resolves the registry URL (--registry flag > powerhouse.config.json > PH_REGISTRY_URL env > default)
2. Installs the package using your package manager with the resolved registry
3. Updates powerhouse.config.json to include the new dependencies
4. Updates style.css with CSS imports if applicable
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

    // Resolve registry URL: flag > config > env > default
    const configPath = join(projectPath, "powerhouse.config.json");
    const config = getConfig(configPath);
    const registryUrl =
      args.registry ??
      config.packageRegistryUrl ??
      process.env.PH_REGISTRY_URL ??
      DEFAULT_REGISTRY_URL;

    if (args.debug) {
      console.log(">>> registryUrl", registryUrl);
    }

    const dependenciesWithVersions = await makeDependenciesWithVersions(
      args.dependencies,
      registryUrl,
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
      console.log(`installing dependencies 📦 from ${registryUrl}...`);
      const installCommand = getPowerhouseProjectInstallCommand(
        packageManager,
        ["--registry", registryUrl],
      );
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
