import type { DefinitionCheckReport } from "@powerhousedao/shared/document-model";
import {
  checkProjectDefinitions,
  type ProjectDefinitions,
} from "document-model/tooling";
import type { ReleaseDecision } from "../release/approval.js";
import type { ReleaseCheck } from "../release/evidence.js";
import type { ProjectModules } from "./project.js";
import {
  type ModelRunOptions,
  processStreams,
  runModelCommand,
} from "./run.js";
import { renderCheckReport } from "./render.js";

/**
 * The edit and the release profile of the definition check, as `ph model
 * check` runs them and the definitions worker runs them for `ph build`.
 */
export const definitionChecks = {
  edit: (project: ProjectDefinitions): Promise<DefinitionCheckReport> =>
    checkProjectDefinitions(project),
  release: async (
    project: ProjectDefinitions,
    modules: ProjectModules,
  ): Promise<ReleaseCheck> => {
    const { checkForRelease } = await import("../release/evidence.js");
    return await checkForRelease(project, modules);
  },
};

/** `ph model check`. Returns the exit code. */
export async function runModelCheck(
  args: {
    readonly json: boolean;
    readonly release?: boolean;
    readonly prepack?: boolean;
  },
  options: ModelRunOptions = {},
): Promise<number> {
  if (args.prepack) {
    if (args.release) {
      (options.streams ?? processStreams).err(
        "ph model check could not run: --prepack and --release cannot be combined.\n",
      );
      return 2;
    }
    return await runPrepackCheck(args.json, options);
  }
  return await runModelCommand(
    {
      name: "ph model check",
      json: args.json,
      read: async (project, modules) =>
        args.release
          ? (await definitionChecks.release(project, modules)).report
          : await definitionChecks.edit(project),
      render: renderCheckReport,
    },
    options,
  );
}

/**
 * `ph model check --prepack`: 0 when the release approval matches the
 * package, 1 when it does not, 2 when it cannot be checked. Loads none of
 * the package's modules.
 */
async function runPrepackCheck(
  json: boolean,
  options: ModelRunOptions,
): Promise<number> {
  const streams = options.streams ?? processStreams;
  const { renderReleaseDecision, verifyRelease } =
    await import("../release/verify.js");
  let decision: ReleaseDecision;
  try {
    decision = verifyRelease(options.projectRoot ?? process.cwd());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    streams.err(`ph model check --prepack could not run: ${message}\n`);
    return 2;
  }
  streams.out(
    `${json ? JSON.stringify({ decision: decision.decision, reasons: decision.reasons }) : renderReleaseDecision(decision)}\n`,
  );
  return decision.decision === "approved" ? 0 : 1;
}
