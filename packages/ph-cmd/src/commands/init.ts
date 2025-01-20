import { Command } from "commander";
import { createProject, parseVersion } from "@powerhousedao/codegen";
import { CommandActionType } from "../types.js";
import {
  HOME_DIR,
  POWERHOUSE_GLOBAL_DIR,
  PH_GLOBAL_PROJECT_NAME,
} from "../utils.js";

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
  console.log("📦 Initializing global project...");

  process.chdir(HOME_DIR);

  try {
    await createProject({
      name: PH_GLOBAL_PROJECT_NAME,
      interactive: false,
      version: parseVersion(options),
    });

    console.log(
      `🚀 Global project initialized successfully: ${POWERHOUSE_GLOBAL_DIR}`,
    );
  } catch (error) {
    console.error("❌ Failed to initialize the global project", error);
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
