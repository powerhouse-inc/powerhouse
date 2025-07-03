import { createProject, parseVersion } from "@powerhousedao/codegen";
import { type Command } from "commander";
import { initHelp } from "../help.js";
import { type CommandActionType } from "../types.js";
import {
  getPackageManagerFromPath,
  PH_BIN_PATH,
  resolvePackageManagerOptions,
  withCustomHelp,
} from "../utils/index.js";

// Extract the type parameters for reuse
export type InitOptions = {
  project?: string;
  interactive?: boolean;
  version?: string;
  dev?: boolean;
  staging?: boolean;
  packageManager?: string;
  pnpm?: boolean;
  yarn?: boolean;
  bun?: boolean;
};

export const init: CommandActionType<
  [string | undefined, InitOptions]
> = async (projectName, options) => {
  console.log("Initializing a new project...");

  try {
    await createProject({
      name: options.project ?? projectName,
      interactive: options.interactive ?? false,
      version: parseVersion(options),
      packageManager:
        resolvePackageManagerOptions(options) ??
        getPackageManagerFromPath(PH_BIN_PATH),
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
      "-v, --version",
      'Specify development version to use. Defaults to "main"',
    )
    .option("-t, --tag", "Same as -v/--version")
    .option("--dev", 'Use "development" version of the boilerplate')
    .option("--staging", 'Use "development" version of the boilerplate')
    .option("--package-manager <packageManager>", "package manager to be used")
    .option("--pnpm", "Use 'pnpm' as package manager")
    .option("--yarn", "Use 'yarn' as package manager")
    .option("--bun", "Use 'bun' as package manager");

  // Use withCustomHelp instead of withHelpAction and addHelpText
  return withCustomHelp<[string | undefined, InitOptions]>(
    initCmd,
    init,
    initHelp,
  );
}
