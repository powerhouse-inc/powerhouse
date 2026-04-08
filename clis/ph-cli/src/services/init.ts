import { createProject } from "@powerhousedao/codegen";
import {
  handleMutuallyExclusiveOptions,
  parsePackageManager,
  parseTag,
} from "@powerhousedao/shared/clis";
import chalk from "chalk";
import { kebabCase } from "change-case";
import enquirer from "enquirer";
import { clean, valid } from "semver";
import type { InitArgs } from "../types.js";
import { setupRemoteDrive } from "../utils/validate-remote-drive.js";

export async function startInit(args: InitArgs) {
  const {
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
  } = args;

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

  try {
    if (remoteDrive) {
      console.log(chalk.blue("\n⏳ Setting up remote drive...\n"));
      await setupRemoteDrive(remoteDrive);
      console.log(chalk.green("\n✅ Remote drive set up."));
    }

    console.log(chalk.bold("\n🚀 Initializing a new project...\n"));
    await createProject({
      ...args,
      name,
      packageManager: parsedPackageManager,
      tag: parsedTag,
    });

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
    throw error;
  }
}
