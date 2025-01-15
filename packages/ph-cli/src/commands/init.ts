import { Command } from "commander";
import { createProject, parseVersion } from "@powerhousedao/codegen";
import { CommandActionType } from "../types.js";

export const init: CommandActionType<
  [
    string | undefined,
    {
      project?: string;
      interactive?: boolean;
      version?: string;
      dev?: boolean;
      staging?: boolean;
    },
  ]
> = async (projectName, options) => {
  console.log("Initializing a new project...");

  try {
    await createProject({
      name: options.project ?? projectName,
      interactive: options.interactive ?? false,
      version: parseVersion(options),
    });
  } catch (error) {
    console.error("Failed to initialize the project", error);
  }
};

export function initCommand(program: Command) {
  program
    .command("init")
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
    .action(init);
}
