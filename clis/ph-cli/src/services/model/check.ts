import { checkProjectDefinitions } from "document-model/tooling";
import { type ModelRunOptions, runModelCommand } from "./run.js";
import { renderCheckReport } from "./render.js";

/** `ph model check`. Returns the exit code. */
export async function runModelCheck(
  args: { readonly json: boolean },
  options: ModelRunOptions = {},
): Promise<number> {
  return await runModelCommand(
    {
      name: "ph model check",
      json: args.json,
      read: (project) => checkProjectDefinitions(project),
      render: renderCheckReport,
    },
    options,
  );
}
