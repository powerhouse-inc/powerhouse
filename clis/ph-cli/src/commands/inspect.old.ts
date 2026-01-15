import type { Command } from "commander";
import { inspectHelp } from "../help.js";
import type { InspectOptions } from "../services/inspect.js";
import type { CommandActionType } from "../types.js";
import { setCustomHelp } from "../utils.js";

async function startInspect(packageName: string, options: InspectOptions) {
  const Inspect = await import("../services/inspect.js");
  const { startInspect } = Inspect;
  return startInspect(packageName, options);
}

export const inspect: CommandActionType<[string, InspectOptions]> = async (
  packageName,
  options,
) => {
  return startInspect(packageName, options);
};

export function inspectCommand(program: Command) {
  const command = program
    .command("inspect")
    .alias("is")
    .description("Inspect a package")
    .option("--debug", "Show additional logs")
    .argument("<packageName>", "The name of the package to inspect")
    .action(inspect);

  setCustomHelp(command, inspectHelp);
}
