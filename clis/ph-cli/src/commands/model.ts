import {
  modelCheckArgs,
  modelInspectArgs,
} from "@powerhousedao/shared/clis/args";
import { command, subcommands } from "cmd-ts";

const EXPERIMENTAL =
  "Experimental: the command, its output and the JSON report can change in any release.";

const EXIT_CODES = `Exit codes:
  0  ok, or skipped. Skipped means the package has no document model, so
     nothing was checked. Read "status".
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
  description: `Check this package's document models through one set of checks:
every model directory in documentModelsDir, whether it stores a schema-first
<name>.json or exports a code-first model from its index.ts. Writes nothing.

\`tsc\` cannot run these checks: a code-first model compiles when its module is
evaluated.

--release (experimental) runs the checks \`ph build --release\` runs: these,
the release checks, and host validation, which validates every model and the
package's scalars entry as a host that installed the package would.

--prepack (experimental) loads nothing. It reads the release approval
\`ph build --release\` wrote in .ph/build/release-approval.json and exits 0
when it matches this package, 1 when it does not (missing, unreadable, stale
or refused), naming the reasons, and 2 when it cannot be checked. To stop a
plain \`npm publish\` too, add it to package.json, then run
\`ph build --release\` (package.json is published, so the approval covers it):
  "scripts": { "prepack": "ph-cli model check --prepack" }
With --json it prints {"decision": ..., "reasons": [...]}.

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
