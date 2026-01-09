import { getPackageVersion } from "@powerhousedao/codegen/file-builders";
import chalk from "chalk";
import { boolean, command, flag, optional, run } from "cmd-ts";
import { detect } from "package-manager-detector/detect";
import { readPackage } from "read-pkg";
import { writePackage } from "write-package";
import { ALL_POWERHOUSE_DEPENDENCIES } from "../utils/constants.js";
import { getTagFromVersion, logVersionUpdate } from "../utils/parsing.js";
import { runCmd } from "../utils/run-cmd.js";

const commandParser = command({
  name: "ph update",
  description:
    "Update your powerhouse dependencies to their latest tagged version",
  args: {
    skipInstall: flag({
      type: optional(boolean),
      long: "skip-install",
      short: "s",
      description: "Skip running `install` with your package manager",
    }),
  },
  handler: async ({ skipInstall }) => {
    console.log(`\n▶️ Updating Powerhouse dependencies...\n`);
    const packageJson = await readPackage();

    if (packageJson.dependencies) {
      for (const [name, version] of Object.entries(packageJson.dependencies)) {
        if (version && ALL_POWERHOUSE_DEPENDENCIES.includes(name)) {
          const tag = getTagFromVersion(version);
          const newVersion = await getPackageVersion({ name, tag });
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
          const newVersion = await getPackageVersion({ name, tag });
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
          const newVersion = await getPackageVersion({ name, tag });
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
          const newVersion = await getPackageVersion({ name, tag });
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

    if (skipInstall) return;

    const packageManager = await detect();

    if (!packageManager) {
      throw new Error(
        `❌ Failed to detect your package manager. Run install manually.`,
      );
    }
    console.log(
      `▶️ Installing updated dependencies with \`${packageManager.agent}\`\n`,
    );
    runCmd(`${packageManager.agent} install`);
  },
});

export async function update(args: string[]) {
  await run(commandParser, args);
}
