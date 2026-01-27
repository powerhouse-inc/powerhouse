import { logVersionUpdate } from "@powerhousedao/codegen/utils";
import { debugArgs } from "@powerhousedao/common/clis";
import chalk from "chalk";
import {
  boolean,
  command,
  flag,
  option,
  optional,
  positional,
  run,
  string,
} from "cmd-ts";
import path from "path";
import { readPackage } from "read-pkg";
import { writePackage } from "write-package";
import {
  ALL_POWERHOUSE_DEPENDENCIES,
  APPS_DEPENDENCIES,
  CLIS_DEPENDENCIES,
} from "../utils/constants.js";
import { dirExists } from "../utils/file-system.js";
import { runCmd } from "../utils/run-cmd.js";

export const useLocal = command({
  name: "use-local",
  description:
    "Use your local `powerhouse` monorepo dependencies the current project.",
  args: {
    monorepoPathPositional: positional({
      type: optional(string),
      displayName: "monorepo path",
      description:
        "Path to your local powerhouse monorepo relative to this project",
    }),
    monorepoPathOption: option({
      type: optional(string),
      long: "path",
      short: "p",
      description:
        "Path to your local powerhouse monorepo relative to this project",
    }),
    skipInstall: flag({
      type: optional(boolean),
      long: "skip-install",
      short: "s",
      description: "Skip running `install` with `pnpm`",
    }),
    ...debugArgs,
  },
  handler: async (args) => {
    const { monorepoPathPositional, monorepoPathOption, skipInstall, debug } =
      args;
    if (debug) {
      console.log({ args });
    }
    const monorepoPath = monorepoPathPositional ?? monorepoPathOption;

    if (!monorepoPath) {
      throw new Error(
        "❌ Please provide the path to your local powerhouse monorepo.",
      );
    }

    const monorepoDirExists = await dirExists(monorepoPath);

    if (!monorepoDirExists) {
      throw new Error(
        "❌ No directory found at the powerhouse monorepo path you specified.",
      );
    }

    console.log(
      `\n▶️ Linking powerhouse dependencies to "${chalk.bold(monorepoPath)}...\n`,
    );

    const packageJson = await readPackage();

    if (packageJson.dependencies) {
      for (const [name, version] of Object.entries(packageJson.dependencies)) {
        if (version && ALL_POWERHOUSE_DEPENDENCIES.includes(name)) {
          const newVersion = buildPnpmLink(name, monorepoPath);
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
          const newVersion = buildPnpmLink(name, monorepoPath);
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
          const newVersion = buildPnpmLink(name, monorepoPath);
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
          const newVersion = buildPnpmLink(name, monorepoPath);
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

    console.log(chalk.green(`\n✅ Project linked successfully\n`));

    if (!skipInstall) {
      console.log(`Installing linked dependencies with \`pnpm\`\n`);
      runCmd(`pnpm install`);
    }

    process.exit(0);
  },
});

function buildPnpmLink(packageName: string, monorepoPath: string) {
  const isCli = CLIS_DEPENDENCIES.includes(packageName);
  const isApp = APPS_DEPENDENCIES.includes(packageName);
  const packageDir = isCli ? "clis" : isApp ? "apps" : "packages";
  const packageNameWithoutNamespace = packageName.replace(
    "@powerhousedao/",
    "",
  );
  const packagePath = path.join(
    monorepoPath,
    packageDir,
    packageNameWithoutNamespace,
  );
  const pnpmLink = `link:${packagePath}`;

  return pnpmLink;
}

export async function runUseLocal(args: string[]) {
  await run(useLocal, args);
}
