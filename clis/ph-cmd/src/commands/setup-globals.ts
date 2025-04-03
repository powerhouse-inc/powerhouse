import { createProject, parseVersion } from "@powerhousedao/codegen";
import { type Command } from "commander";
import fs from "node:fs";
import { type CommandActionType } from "../types.js";
import {
  getPackageManagerFromPath,
  HOME_DIR,
  PH_BIN_PATH,
  PH_GLOBAL_PROJECT_NAME,
  POWERHOUSE_GLOBAL_DIR,
} from "../utils.js";

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
  // check if the global project already exists
  const globalProjectExists = fs.existsSync(POWERHOUSE_GLOBAL_DIR);

  if (globalProjectExists) {
    console.error(
      `📦 Global project already exists at: ${POWERHOUSE_GLOBAL_DIR}`,
    );
    return;
  }

  console.error("📦 Initializing global project...");
  process.chdir(HOME_DIR);

  try {
    await createProject({
      name: PH_GLOBAL_PROJECT_NAME,
      interactive: false,
      version: parseVersion(options),
      packageManager:
        options.packageManager ?? getPackageManagerFromPath(PH_BIN_PATH),
    });

    console.error(
      `🚀 Global project initialized successfully: ${POWERHOUSE_GLOBAL_DIR}`,
    );
  } catch (error) {
    console.error("❌ Failed to initialize the global project", error);
  }
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
