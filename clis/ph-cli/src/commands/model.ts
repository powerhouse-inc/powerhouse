import {
  modelCheckArgs,
  modelInspectArgs,
  modelPrepackArgs,
} from "@powerhousedao/shared/clis/args";
import { command, subcommands } from "cmd-ts";

export function failedToRun(error: unknown): 2 {
  console.error(error instanceof Error ? error.message : error);
  return 2;
}

export const modelCheck = command({
  name: "check",
  description: `Compile this package's definition sources and report what is wrong with them.

\`tsc\` cannot run this check, because a code-first declaration compiles when its
module is evaluated and \`tsc\` never evaluates modules. Run it after every edit.

Exit codes:
  0  ok, or skipped. Read \`status\`, because a skipped package was not checked
     at all and is never release approval.
  1  invalid. The declarations were checked and something is wrong with them.
  2  failed. A configuration, import, or tooling error stopped the check, and
     nothing was decided.

Output:
  ph model check --json                 one report on stdout, logs on stderr
  ph model check --watch                human output, follows edits
  ph model check --watch --json-lines   one report per line, newest only

Quote a --source value. zsh with extendedglob reads an unquoted '#' as a glob
operator and fails with "no matches found".
  ph model check --source './src/models.ts#/invoiceFamily'`,
  args: modelCheckArgs,
  handler: async (args) => {
    if (args.debug) {
      console.error(args);
    }
    const { runModelCheck, runModelCheckWatch } =
      await import("../services/model-check.js");
    const run = args.watch ? runModelCheckWatch : runModelCheck;
    process.exit(await run(args).catch(failedToRun));
  },
});

export const modelInspect = command({
  name: "inspect",
  description: `Print the exact structured definition of one compiled model.

  ph model inspect <documentType>@<version> --json

Writes nothing. The envelope is canonical JSON, so you can diff the output of
two releases.`,
  args: modelInspectArgs,
  handler: async (args) => {
    if (args.debug) {
      console.error(args);
    }
    const { runModelInspect } = await import("../services/model-inspect.js");
    process.exit(await runModelInspect(args).catch(failedToRun));
  },
});

export const modelPrepack = command({
  name: "prepack",
  description: `Run this package's release check before a package manager writes its tarball.

Wire it as the package's \`prepack\` script so \`npm pack\`, \`pnpm pack\`, and a raw
\`npm publish\` all pass through it. It reuses the generation \`ph build\` already
completed when that generation still covers this tree, and runs one otherwise.

Exit codes: 0 approved, 1 the declarations are wrong, 2 the check could not run.`,
  args: modelPrepackArgs,
  handler: async (args) => {
    if (args.debug) {
      console.log(args);
    }
    try {
      const { runPrepack } = await import("../services/build.js");
      const result = await runPrepack(args);
      process.exit(result.exitCode);
    } catch (error) {
      console.error(error);
      process.exit(2);
    }
  },
});

export const model = subcommands({
  name: "model",
  description:
    "Check, inspect, and gate this package's document-model definitions. Use with `check`, `inspect`, or `prepack`.",
  cmds: { check: modelCheck, inspect: modelInspect, prepack: modelPrepack },
});
