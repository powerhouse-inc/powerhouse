import { createProject } from "@powerhousedao/codegen";
import {
  handleMutuallyExclusiveOptions,
  parsePackageManager,
  parseTag,
} from "@powerhousedao/codegen/utils";
import { packageManagerArgs } from "@powerhousedao/ph-cli/commands";
import chalk from "chalk";
import { kebabCase } from "change-case";
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
import enquirer from "enquirer";
import { clean, valid } from "semver";
import { setupRemoteDrive } from "../utils/validate-remote-drive.js";

export const initArgs = {
  namePositional: positional({
    type: optional(string),
    displayName: "name",
    description:
      "The name of your project. A new directory will be created in your current directory with this name.",
  }),
  nameOption: option({
    type: optional(string),
    long: "name",
    short: "n",
    description:
      "The name of your project. A new directory will be created in your current directory with this name.",
  }),
  ...packageManagerArgs,
  tag: option({
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
  dev: flag({
    type: optional(boolean),
    long: "dev",
    short: "d",
    description: "Use the `dev` release tag.",
  }),
  staging: flag({
    type: optional(boolean),
    long: "staging",
    short: "s",
    description: "Use the `staging` release tag.",
  }),
  remoteDrive: option({
    type: optional(string),
    long: "remote-drive",
    short: "r",
    description: "Remote drive identifier.",
  }),
};

export const init = command({
  name: "init",
  description: "Initialize a new project",
  args: initArgs,
  handler: async ({
    namePositional,
    nameOption,
    packageManager,
    npm,
    pnpm,
    yarn,
    bun,
    tag,
    version,
    dev,
    staging,
    remoteDrive,
  }) => {
    let name = namePositional ?? nameOption;
    if (!name) {
      const { prompt } = enquirer;

      const result = await prompt<{ name: string }>([
        {
          type: "input",
          name: "name",
          message: "What is the project name?",
          required: true,
          result: (value) => kebabCase(value),
        },
      ]);
      name = result.name;
    }
    if (!name) {
      throw new Error("You must provide a name for your project.");
    }

    if (version !== undefined && !valid(clean(version))) {
      throw new Error(`Invalid version: ${version}`);
    }

    handleMutuallyExclusiveOptions(
      {
        tag,
        version,
        dev,
        staging,
      },
      "versioning strategy",
    );

    handleMutuallyExclusiveOptions(
      {
        npm,
        pnpm,
        yarn,
        bun,
        packageManager,
      },
      "package manager",
    );

    const parsedPackageManager =
      parsePackageManager({
        npm,
        pnpm,
        yarn,
        bun,
        packageManager,
      }) ?? "npm";

    const parsedTag = parseTag({
      tag,
      dev,
      staging,
    });

    return {
      name,
      version,
      remoteDrive,
      packageManager: parsedPackageManager,
      tag: parsedTag,
    };
  },
});

export async function runInit(args: string[]) {
  try {
    const parsedArgs = await run(init, args);

    const { name, remoteDrive } = parsedArgs;

    if (remoteDrive) {
      console.log(chalk.blue("\n⏳ Setting up remote drive...\n"));
      await setupRemoteDrive(remoteDrive);
      console.log(chalk.green("\n✅ Remote drive set up."));
    }

    console.log(chalk.bold("\n🚀 Initializing a new project...\n"));
    await createProject(parsedArgs);

    if (remoteDrive) {
      console.log();
      console.log("To link your project to GitHub:");
      console.log();
      console.log("  1. Create a new repository on GitHub");
      console.log(`  2. cd ${name}`);
      console.log("  3. git add . && git commit -m 'Initial commit'");
      console.log("  4. git remote add origin <your-github-url>");
      console.log(`  5. git push -u origin main`);
      console.log();
    }
  } catch (error) {
    console.error("\n❌ Failed to initialize project: \n");
    console.error(error);
    process.exit(1);
  }
}
