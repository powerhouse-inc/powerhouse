import {
  modelCheckArgs,
  modelInspectArgs,
} from "@powerhousedao/shared/clis/args";
import { command, subcommands } from "cmd-ts";

const EXPERIMENTAL =
  "Experimental: the command, its output and the JSON report can change in any release.";

const EXIT_CODES = `Exit codes:
  0  ok, or skipped. Skipped means no code-first source is selected and the
     package has no stored model, so nothing was read. Read "status".
  1  invalid. The models were read and at least one is wrong.
  2  failed. The configuration or a module could not be read, the arguments
     are wrong, or the command could not run.`;

const OUTPUT = (name: string) => `Output:
  ph model ${name}          a readable report on stdout
  ph model ${name} --json   exactly one JSON report on stdout and nothing else
Logs, including what the package's modules print while they load, go to
stderr. When the command cannot run at all, it prints only a message on
stderr and exits 2.`;

export const modelCheck = command({
  name: "check",
  description: `Check this package's document models: the code-first sources
definitionSources selects and the stored schema-first models in
documentModelsDir, through one set of checks. Writes nothing.

\`tsc\` cannot run these checks: a code-first model compiles when its module is
evaluated.

${EXIT_CODES}

${OUTPUT("check")}

${EXPERIMENTAL}`,
  args: modelCheckArgs,
  handler: async (args) => {
    if (args.debug) {
      console.error(args);
    }
    const [{ runModelCheck }, { exitWithModelCommand }] = await Promise.all([
      import("../services/model/check.js"),
      import("../services/model/run.js"),
    ]);
    await exitWithModelCommand(args.json, (streams) =>
      runModelCheck(args, { streams }),
    );
  },
});

export const modelInspect = command({
  name: "inspect",
  description: `Describe this package's document models without checking them: for each
model its digest and compatibility, and for each of its versions the source,
scopes, scalars and operations. With <documentType>@<version>, describe that
version only and add its full definition to the JSON report. Writes nothing.

${EXIT_CODES}

${OUTPUT("inspect")}

${EXPERIMENTAL}`,
  args: modelInspectArgs,
  handler: async (args) => {
    if (args.debug) {
      console.error(args);
    }
    const [{ runModelInspect }, { exitWithModelCommand }] = await Promise.all([
      import("../services/model/inspect.js"),
      import("../services/model/run.js"),
    ]);
    await exitWithModelCommand(args.json, (streams) =>
      runModelInspect(args, { streams }),
    );
  },
});

export const model = subcommands({
  name: "model",
  description:
    "Check or inspect this package's document models (experimental): `check`, `inspect`.",
  cmds: { check: modelCheck, inspect: modelInspect },
});
