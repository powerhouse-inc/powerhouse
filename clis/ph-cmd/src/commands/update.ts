import { debugArgs } from "@powerhousedao/shared/clis/args";
import { ALL_POWERHOUSE_DEPENDENCIES } from "@powerhousedao/shared/constants";
import { boolean, command, flag, optional } from "cmd-ts";

export const update = command({
  name: "update",
  description:
    "Update your Powerhouse dependencies and installed packages to their latest versions",
  args: {
    skipInstall: flag({
      type: optional(boolean),
      long: "skip-install",
      short: "s",
      description: "Skip running `install` with your package manager",
    }),
    updatePackages: flag({
      type: optional(boolean),
      long: "update-packages",
      description:
        "Auto-update installed packages (powerhouse.config.json) to their newest same-major version",
    }),
    ...debugArgs,
  },
  handler: async (args) => {
    const { skipInstall, updatePackages, debug } = args;
    if (debug) {
      console.log({ args });
    }
    console.log(`\n▶️ Updating Powerhouse dependencies...\n`);
    const [
      { default: chalk },
      { readPackage },
      { writePackage },
      { getTagFromVersion, logVersionUpdate, parsePackageVersion, runCmd },
      { resolveRegistryUrl },
      { updateInstalledPackages },
    ] = await Promise.all([
      import("chalk"),
      import("read-pkg"),
      import("write-package"),
      import("@powerhousedao/shared/clis"),
      import("@powerhousedao/shared/registry"),
      import("./update-packages.js"),
    ]);
    const registryUrl = resolveRegistryUrl({ projectPath: process.cwd() });
    const packageJson = await readPackage();

    if (packageJson.dependencies) {
      for (const [name, version] of Object.entries(packageJson.dependencies)) {
        if (version && ALL_POWERHOUSE_DEPENDENCIES.includes(name)) {
          const tag = getTagFromVersion(version);
          const newVersion = await parsePackageVersion({ name, tag });
          packageJson.dependencies[name] = newVersion;
          logVersionUpdate({
            name,
            version,
            newVersion,
          });
        }
      }
    }

    if (packageJson.devDependencies) {
      for (const [name, version] of Object.entries(
        packageJson.devDependencies,
      )) {
        if (version && ALL_POWERHOUSE_DEPENDENCIES.includes(name)) {
          const tag = getTagFromVersion(version);
          const newVersion = await parsePackageVersion({ name, tag });
          packageJson.devDependencies[name] = newVersion;
          logVersionUpdate({
            name,
            version,
            newVersion,
          });
        }
      }
    }

    if (packageJson.optionalDependencies) {
      for (const [name, version] of Object.entries(
        packageJson.optionalDependencies,
      )) {
        if (version && ALL_POWERHOUSE_DEPENDENCIES.includes(name)) {
          const tag = getTagFromVersion(version);
          const newVersion = await parsePackageVersion({ name, tag });
          packageJson.optionalDependencies[name] = newVersion;
          logVersionUpdate({
            name,
            version,
            newVersion,
          });
        }
      }
    }

    if (packageJson.peerDependencies) {
      for (const [name, version] of Object.entries(
        packageJson.peerDependencies,
      )) {
        if (version && ALL_POWERHOUSE_DEPENDENCIES.includes(name)) {
          const tag = getTagFromVersion(version);
          const newVersion = await parsePackageVersion({ name, tag });
          packageJson.peerDependencies[name] = newVersion;
          logVersionUpdate({
            name,
            version,
            newVersion,
          });
        }
      }
    }

    await writePackage(packageJson);

    console.log(chalk.green(`\n✅ Project updated successfully\n`));

    // Detect the package manager once; it backs the install below and the
    // update of `local` (node_modules) installed packages.
    const { detect } = await import("package-manager-detector/detect");
    const packageManager = await detect();

    await updateInstalledPackages({
      registryUrl,
      auto: updatePackages ?? false,
      skipInstall: skipInstall ?? false,
      packageManager,
    });

    if (skipInstall) return;

    if (!packageManager) {
      throw new Error(
        `❌ Failed to detect your package manager. Run install manually.`,
      );
    }
    console.log(
      `▶️ Installing updated dependencies with \`${packageManager.agent}\`\n`,
    );
    runCmd(`${packageManager.agent} install`);
    process.exit(0);
  },
});
