import { createProject, parseTag } from "@powerhousedao/codegen";
import type { Command } from "commander";
import { initHelp } from "../help.js";
import type { CommandActionType } from "../types.js";
import {
  getPackageManagerFromPath,
  PH_BIN_PATH,
  resolvePackageManagerOptions,
  setupRemoteDrive,
  withCustomHelp,
} from "../utils/index.js";

// Extract the type parameters for reuse
export type InitOptions = {
  project?: string;
  interactive?: boolean;
  branch?: string;
  tag?: string;
  dev?: boolean;
  staging?: boolean;
  packageManager?: string;
  npm?: boolean;
  pnpm?: boolean;
  yarn?: boolean;
  bun?: boolean;
  remoteDrive?: string;
};

export const init: CommandActionType<
  [string | undefined, InitOptions]
> = async (projectName, options) => {
  console.log("Initializing a new project...");

  try {
    await createProject({
      name: options.project ?? projectName,
      interactive: options.interactive ?? false,
      tag: parseTag({
        tag: options.tag,
        dev: options.dev,
        staging: options.staging,
      }),
      branch: options.branch,
      packageManager:
        resolvePackageManagerOptions(options) ??
        getPackageManagerFromPath(PH_BIN_PATH),
      vetraDriveUrl: options.remoteDrive,
    });
  } catch (error) {
    console.error("Failed to initialize the project", error);
  }
};

export function initCommand(program: Command): Command {
  const initCmd = program
    .command("init")
    .description("Initialize a new project")
    .argument("[project-name]", "Name of the project")
    .option("-p, --project", "Name of the project")
    .option("-i, --interactive", "Run the command in interactive mode")
    .option(
      "-b, --branch <branch>",
      "Specify custom boilerplate branch to use.",
    )
    .option(
      "-t, --tag <tag>",
      'Version of the Powerhouse dependencies to use. Defaults to "main"',
    )
    .option("--dev", 'Use "development" version of the boilerplate')
    .option("--staging", 'Use "staging" version of the boilerplate')
    .option("--package-manager <packageManager>", "package manager to be used")
    .option("--npm", "Use 'npm' as package manager")
    .option("--pnpm", "Use 'pnpm' as package manager")
    .option("--yarn", "Use 'yarn' as package manager")
    .option("--bun", "Use 'bun' as package manager")
    .option("-r, --remote-drive <remoteDrive>", "Remote drive identifier");

  initCmd.hook("preAction", async (thisCommand) => {
    const options = thisCommand.opts<InitOptions>();

    if (options.remoteDrive) {
      const isValid = await setupRemoteDrive(options.remoteDrive);
      if (!isValid) {
        process.exit(1); // Exit if validation fails
      }
    }
  });

  initCmd.hook("postAction", (thisCommand) => {
    const options = thisCommand.opts<InitOptions>();
    if (options.remoteDrive) {
      const args = thisCommand.args as [string | undefined];
      const projectName = options.project ?? args[0];

      let branchName = "main";
      if (options.dev) {
        branchName = "dev";
      } else if (options.staging) {
        branchName = "staging";
      }

      console.log();
      console.log("To link your project to GitHub:");
      console.log();
      console.log("  1. Create a new repository on GitHub");
      console.log(`  2. cd ${projectName}`);
      console.log("  3. git add . && git commit -m 'Initial commit'");
      console.log("  4. git remote add origin <your-github-url>");
      console.log(`  5. git push -u origin ${branchName}`);
      console.log();
    }
  });

  // Use withCustomHelp instead of withHelpAction and addHelpText
  return withCustomHelp<[string | undefined, InitOptions]>(
    initCmd,
    init,
    initHelp,
  );
}
