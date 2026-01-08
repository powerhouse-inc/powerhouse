import { createProject } from "@powerhousedao/codegen";
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
import type { Command } from "commander";
import enquirer from "enquirer";
import { clean, valid } from "semver";
import { parsePackageManager, parseTag } from "../utils/parsing.js";
import { setupRemoteDrive } from "../utils/validate-remote-drive.js";

function handleMutuallyExclusiveOptions(
  options: Record<string, string | boolean | number | undefined>,
  optionsName: string,
) {
  const mutuallyExclusiveOptions = Object.entries(options)
    .map(([k, v]) => {
      if (v !== undefined) return k;
      return undefined;
    })
    .filter((v) => v !== undefined);

  if (mutuallyExclusiveOptions.length > 1) {
    throw new Error(
      `Cannot specify multiple ${optionsName} options. You provided: ${mutuallyExclusiveOptions.join(", ")}`,
    );
  }
}

const commandParser = command({
  name: "ph init",
  description: "Initialize a new project",
  args: {
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
    packageManager: option({
      type: optional(oneOf(["npm", "pnpm", "yarn", "bun"])),
      long: "package-manager",
      short: "p",
      description:
        "Specify the package manager to use for your project. Can be one of: `npm`, `pnpm`, `yarn`, or `bun`. Defaults to your environment package manager.",
    }),
    npm: flag({
      type: optional(boolean),
      long: "npm",
      description: "Use 'npm' as package manager",
    }),
    pnpm: flag({
      type: optional(boolean),
      long: "pnpm",
      description: "Use 'pnpm' as package manager",
    }),
    yarn: flag({
      type: optional(boolean),
      long: "yarn",
      description: "Use 'yarn' as package manager",
    }),
    bun: flag({
      type: optional(boolean),
      long: "bun",
      description: "Use 'bun' as package manager",
    }),
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
  },
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

async function init(argv: string[]) {
  try {
    const parsedArgs = await run(commandParser, argv);

    const { name, remoteDrive } = parsedArgs;

    if (remoteDrive) {
      console.log("Setting up remote drive...");
      await setupRemoteDrive(remoteDrive);
    }

    console.log("\nInitializing a new project...");
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
    console.error("\nFailed to initialize project: \n");
    console.error(error);
    process.exit(1);
  }
}

export function initCommand(program: Command): Command {
  const initCmd = program
    .command("init")
    .allowUnknownOption(true) // let cmd-ts be the authority
    .action(async (..._args) => {
      const cmd = _args[_args.length - 1] as Command;
      await init(cmd.args);
    });

  return initCmd;
}
