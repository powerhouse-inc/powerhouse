import { installArgs } from "@powerhousedao/shared/clis/args";
import { execSync } from "child_process";
import { command } from "cmd-ts";

export const install = command({
  name: "install",
  aliases: ["add", "i"],
  description: `
The install command adds Powerhouse dependencies to your project.

By default it only registers the package in powerhouse.config.json with
provider "registry" — Connect will load it from the registry CDN at runtime.

With --local, the package is also installed into node_modules and marked
as provider "local" — it will be bundled into ph connect build so the
preview works without the registry being reachable.

Resolution order for the registry URL:
  --registry flag > PH_REGISTRY_URL env > powerhouse.config.json > default
  `,
  args: installArgs,
  handler: async (args) => {
    if (args.debug) {
      console.log(args);
    }

    const { getPowerhouseProjectInfo, makeDependenciesWithVersions } =
      await import("@powerhousedao/shared/clis");

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

    const { resolveRegistryUrl } =
      await import("@powerhousedao/shared/registry");
    const registryUrl = resolveRegistryUrl({
      registry: args.registry,
      projectPath,
    });

    if (args.debug) {
      console.log(">>> registryUrl", registryUrl);
    }

    const dependenciesWithVersions = await makeDependenciesWithVersions(
      args.dependencies,
      registryUrl,
    );

    if (args.debug) {
      console.log(">>> parsedDependencies", dependenciesWithVersions);
      console.log("\n>>> projectInfo", {
        localProjectPath,
        globalProjectPath,
        packageManager,
        isGlobal,
      });
    }

    if (args.local) {
      if (dependenciesWithVersions.length === 0) {
        throw new Error(
          "--local requires at least one package name (e.g. ph install --local @scope/pkg)",
        );
      }
      try {
        const specs = dependenciesWithVersions.map((d) =>
          d.version ? `${d.name}@${d.version}` : d.name,
        );

        // Route only the scopes of the packages being installed to the
        // resolved registry, leaving transitive deps from other scopes
        // (and unscoped packages) on the package manager's default. This
        // avoids requiring a project-level .npmrc when the user already
        // has packageRegistryUrl in powerhouse.config.json.
        const scopes = new Set<string>();
        for (const dep of dependenciesWithVersions) {
          if (dep.name.startsWith("@")) {
            const scope = dep.name.split("/")[0];
            scopes.add(scope);
          }
        }
        const scopeRegistryArgs = Array.from(scopes).map(
          (scope) => `--${scope}:registry=${registryUrl}`,
        );

        const minReleaseAgeArgs =
          packageManager === "pnpm" ? ["--config.minimum-release-age=0"] : [];

        const allowBuildArgs =
          packageManager === "pnpm" && args.allowBuild.length > 0
            ? [`--allow-build=${args.allowBuild.join(",")}`]
            : [];

        const { resolveCommand } = await import("package-manager-detector");
        const resolved = resolveCommand(packageManager, "add", [
          ...specs,
          ...scopeRegistryArgs,
          ...minReleaseAgeArgs,
          ...allowBuildArgs,
        ]);
        if (!resolved) {
          throw new Error(
            `Failed to resolve install command for package manager "${packageManager}".`,
          );
        }
        const installCommand = `${resolved.command} ${resolved.args.join(" ")}`;
        if (scopeRegistryArgs.length > 0) {
          console.log(
            `Installing dependencies 📦 (routing ${Array.from(scopes).join(", ")} → ${registryUrl})...`,
          );
        } else {
          console.log("Installing dependencies 📦...");
        }
        console.log(`> ${installCommand}`);
        execSync(installCommand, {
          stdio: "inherit",
          cwd: projectPath,
        });
        console.log("Dependency installed successfully 🎉");
      } catch (error) {
        console.error("❌ Failed to install dependencies");
        throw error;
      }
    }

    const { updateConfigFile, updateStylesFile } = await import("../utils.js");

    try {
      console.log("⚙️ Updating powerhouse config file...");
      updateConfigFile(
        dependenciesWithVersions,
        projectPath,
        "install",
        args.local ? "local" : "registry",
        registryUrl,
        args.registry !== undefined,
      );
      console.log("Config file updated successfully 🎉");
    } catch (error) {
      console.error("❌ Failed to update config file");
      throw error;
    }

    if (args.local) {
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
