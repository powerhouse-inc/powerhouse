import { debugArgs } from "@powerhousedao/shared/clis/args";
import {
  command,
  number,
  oneOf,
  option,
  optional,
  positional,
  string,
} from "cmd-ts";
import { skipInstallArgs } from "../utils/install-added-dependencies.js";

export const generatePieceActionCmd = command({
  name: "piece-action",
  description: "Generate an action inside an existing piece",
  args: {
    namePositional: positional({
      type: optional(string),
      displayName: "name",
      description: "The name of the action, e.g. get-record",
    }),
    name: option({
      type: optional(string),
      long: "name",
      short: "n",
      description: "The name of the action to generate",
    }),
    piece: option({
      type: optional(string),
      long: "piece",
      short: "p",
      description:
        "The piece directory under pieces/ to add the action to. Optional when the project ships exactly one piece.",
    }),
    requireReactor: option({
      type: optional(oneOf(["read", "write"] as const)),
      long: "require-reactor",
      description:
        "Declare reactor access for the action: read, or write (which includes read). The action then gets context.reactor",
    }),
    defaultTimeoutSeconds: option({
      type: optional(number),
      long: "default-timeout-seconds",
      description:
        "Write defaultTimeoutSeconds: the step timeout used when the workflow sets none",
    }),
    defaultMaxAttempts: option({
      type: optional(number),
      long: "default-max-attempts",
      description:
        "Write defaultRetry: { maxAttempts }: the attempts (1 is no retry) used when the workflow sets no retry",
    }),
    ...skipInstallArgs,
    ...debugArgs,
  },
  handler: async (args) => {
    const { startGeneratePieceAction } =
      await import("../services/generate-piece-action.js");
    await startGeneratePieceAction(args, process.cwd());
    process.exit(0);
  },
});
