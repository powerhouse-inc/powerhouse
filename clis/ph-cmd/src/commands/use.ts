import { getPackageVersion } from "@powerhousedao/codegen/file-builders";
import {
  boolean,
  command,
  flag,
  oneOf,
  option,
  optional,
  positional,
  run,
  string,
} from "cmd-ts";
import { detect } from "detect-package-manager";
import { readPackage } from "read-pkg";
import { clean, valid } from "semver";
import { writePackage } from "write-package";
import { ALL_POWERHOUSE_DEPENDENCIES } from "../utils/constants.js";
import {
  handleMutuallyExclusiveOptions,
  logVersionUpdate,
} from "../utils/parsing.js";
import { runCmd } from "../utils/run-cmd.js";

const commandParser = command({
  name: "ph use",
  description:
    "Specify the release version of Powerhouse dependencies to use.\nTo use a release tag, specify `staging`, `dev`, or `latest` as the first argument to this command or with the --tag option.\n You can also use a specific version with the --version option.",
  args: {
    tagPositional: positional({
      type: optional(oneOf(["latest", "staging", "dev"])),
      displayName: "tag",
      description: `Specify the release tag to use for your project. Can be one of: "latest", "staging", or "dev".`,
    }),
    tagOption: option({
      type: optional(oneOf(["latest", "staging", "dev"])),
      long: "tag",
      short: "t",
      description: `Specify the release tag to use for your project. Can be one of: "latest", "staging", or "dev".`,
    }),
    version: option({
      type: optional(string),
      long: "version",
      short: "v",
      description:
        "Specify the exact semver release version to use for your project.",
    }),
    skipInstall: flag({
      type: optional(boolean),
      long: "skip-install",
      short: "s",
    }),
  },
  handler: async ({ tagPositional, tagOption, version, skipInstall }) => {
    const tag = tagPositional ?? tagOption;
    handleMutuallyExclusiveOptions({ tag, version }, "versioning strategy");

    if (!tag && !version) {
      throw new Error(
        "Please specify either a release tag or a version to use.",
      );
    }

    if (version && !valid(clean(version))) {
      throw new Error(`Invalid version: ${version}`);
    }

    console.log(`Updating project to use ${version ?? tag}`);

    const packageJson = await readPackage();

    if (packageJson.dependencies) {
      for (const [name, existingVersion] of Object.entries(
        packageJson.dependencies,
      )) {
        if (existingVersion && ALL_POWERHOUSE_DEPENDENCIES.includes(name)) {
          const newVersion = await getPackageVersion({ name, tag, version });
          packageJson.dependencies[name] = newVersion;
          logVersionUpdate({
            name,
            version: existingVersion,
            newVersion,
          });
        }
      }
    }

    if (packageJson.devDependencies) {
      for (const [name, existingVersion] of Object.entries(
        packageJson.devDependencies,
      )) {
        if (existingVersion && ALL_POWERHOUSE_DEPENDENCIES.includes(name)) {
          const newVersion = await getPackageVersion({ name, tag, version });
          packageJson.devDependencies[name] = newVersion;
          logVersionUpdate({
            name,
            version: existingVersion,
            newVersion,
          });
        }
      }
    }

    if (packageJson.optionalDependencies) {
      for (const [name, existingVersion] of Object.entries(
        packageJson.optionalDependencies,
      )) {
        if (existingVersion && ALL_POWERHOUSE_DEPENDENCIES.includes(name)) {
          const newVersion = await getPackageVersion({ name, tag, version });
          packageJson.optionalDependencies[name] = newVersion;
          logVersionUpdate({
            name,
            version: existingVersion,
            newVersion,
          });
        }
      }
    }

    if (packageJson.peerDependencies) {
      for (const [name, existingVersion] of Object.entries(
        packageJson.peerDependencies,
      )) {
        if (existingVersion && ALL_POWERHOUSE_DEPENDENCIES.includes(name)) {
          const newVersion = await getPackageVersion({ name, tag, version });
          packageJson.peerDependencies[name] = newVersion;
          logVersionUpdate({
            name,
            version: existingVersion,
            newVersion,
          });
        }
      }
    }

    await writePackage(packageJson);

    if (skipInstall) return;

    const packageManager = await detect();

    console.log(`Installing updated dependencies with \`${packageManager}\``);
    runCmd(`${packageManager} install`);
  },
});

export async function use(args: string[]) {
  await run(commandParser, args);
}
