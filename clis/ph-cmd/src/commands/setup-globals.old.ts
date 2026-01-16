import type { Command } from "commander";
import { setupGlobalsHelp } from "../help.js";
import type { CommandActionType } from "../types.js";
import { createGlobalProject, withCustomHelp } from "../utils/index.js";
import type { Agent } from "package-manager-detector";

// Extract the type parameters for reuse
export type SetupGlobalsOptions = {
  project?: string;
  interactive?: boolean;
  version?: string;
  dev?: boolean;
  staging?: boolean;
  packageManager?: Agent;
  npm?: boolean;
  pnpm?: boolean;
  yarn?: boolean;
  bun?: boolean;
};

export const setupGlobals: CommandActionType<
  [string | undefined, SetupGlobalsOptions]
> = async (projectName, options) => {
  await createGlobalProject(projectName, options);
};

export function setupGlobalsCommand(program: Command): Command {
  const setupGlobalsCmd = program
    .command("setup-globals")
    .description("Initialize a new global project")
    .argument("[project-name]", "Name of the project")
    .option("-p, --project", "Name of the project")
    .option("-i, --interactive", "Run the command in interactive mode")
    .option(
      "-t, --tag",
      'Specify development version to use. Defaults to "main"',
    )
    .option("--dev", 'Use "development" version of the boilerplate')
    .option("--staging", 'Use "development" version of the boilerplate')
    .option("--package-manager <packageManager>", "package manager to be used")
    .option("--npm", "Use 'npm' as package manager")
    .option("--pnpm", "Use 'pnpm' as package manager")
    .option("--yarn", "Use 'yarn' as package manager")
    .option("--bun", "Use 'bun' as package manager");

  // Use withCustomHelp instead of withHelpAction and addHelpText
  return withCustomHelp<[string | undefined, SetupGlobalsOptions]>(
    setupGlobalsCmd,
    setupGlobals,
    setupGlobalsHelp,
  );
}
