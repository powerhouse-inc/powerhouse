import { Command } from "commander";
import { createProject } from "@powerhousedao/codegen";
import { CommandActionType } from "../types.js";

export const init: CommandActionType<
  [string | undefined, { interactive?: boolean }]
> = async (projectName, options) => {
  console.log("Initializing a new project...", projectName);
  console.log("Options", options);
  const positionalArgs: string[] = [];

  if (projectName) {
    positionalArgs.push(projectName);
  }

  try {
    await createProject({
      _: positionalArgs,
      "--interactive": !!options.interactive,
    });
  } catch {
    console.log("Failed to initialize the project");
  }
};

export function initCommand(program: Command) {
  program
    .command("init")
    .description("Initialize a new project")
    .argument("[project-name]", "Name of the project")
    .option("--interactive", "Run the command in interactive mode")
    .action(init);
}
