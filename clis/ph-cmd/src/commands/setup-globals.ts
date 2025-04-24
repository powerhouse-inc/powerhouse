import { type Command } from "commander";
import { type CommandActionType } from "../types.js";
import { createGlobalProject } from "../utils.js";

export const setupGlobals: CommandActionType<
  [
    string | undefined,
    {
      project?: string;
      interactive?: boolean;
      version?: string;
      dev?: boolean;
      staging?: boolean;
      packageManager?: string;
    },
  ]
> = async (projectName, options) => {
  await createGlobalProject(projectName, options);
};

export function setupGlobalsCommand(program: Command) {
  program
    .command("setup-globals")
    .description("Initialize a new project")
    .argument("[project-name]", "Name of the project")
    .option("-p, --project", "Name of the project")
    .option("-i, --interactive", "Run the command in interactive mode")
    .option(
      "-v, --version",
      'Specify development version to use. Defaults to "main"',
    )
    .option("--dev", 'Use "development" version of the boilerplate')
    .option("--staging", 'Use "development" version of the boilerplate')
    .option(
      "--package-manager <packageManager>",
      "force package manager to use",
    )
    .action(setupGlobals);
}
