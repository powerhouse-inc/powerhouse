import type { DefinitionCheckReport } from "@powerhousedao/shared/document-model";
import type { ReleaseCheck } from "../release/evidence.js";
import { definitionChecks } from "./check.js";
import { readProjectDefinitions } from "./project.js";

/**
 * What the definitions worker reports for each profile. `ph build` forks the
 * worker so the package's own modules never run in the build process.
 */
export type DefinitionsResults = {
  readonly edit: DefinitionCheckReport;
  readonly release: ReleaseCheck;
};

export type DefinitionsProfile = keyof DefinitionsResults;

/** The worker's one IPC message: the check's result, or why it could not run. */
export type DefinitionsReply<P extends DefinitionsProfile> =
  | { readonly ok: true; readonly result: DefinitionsResults[P] }
  | { readonly ok: false; readonly message: string };

async function check(
  projectRoot: string,
  profile: DefinitionsProfile,
): Promise<DefinitionsReply<DefinitionsProfile>> {
  const read: (
    ...args: Parameters<typeof definitionChecks.release>
  ) => Promise<DefinitionsResults[DefinitionsProfile]> =
    definitionChecks[profile];
  try {
    return {
      ok: true,
      result: await readProjectDefinitions(projectRoot, read, {
        allowMissingConfig: true,
      }),
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

// The build that forked this worker has gone: nothing is left to report to.
process.on("disconnect", () => process.exit(1));
const [projectRoot, profile] = process.argv.slice(2) as [
  string,
  DefinitionsProfile,
];
const reply = await check(projectRoot, profile);
// Exit once the reply is sent: a module's timer must not keep the worker alive.
process.send!(reply, () => process.exit(0));
