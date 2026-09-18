import { debugArgs } from "@powerhousedao/shared/clis/args";
import { command, oneOf, option, optional, positional, string } from "cmd-ts";

export const generatePieceTriggerCmd = command({
  name: "piece-trigger",
  description: "Generate a trigger inside an existing piece",
  args: {
    namePositional: positional({
      type: optional(string),
      displayName: "name",
      description: "The name of the trigger, e.g. new-record",
    }),
    name: option({
      type: optional(string),
      long: "name",
      short: "n",
      description: "The name of the trigger to generate",
    }),
    piece: option({
      type: optional(string),
      long: "piece",
      short: "p",
      description:
        "The piece directory under pieces/ to add the trigger to. Optional when the project ships exactly one piece.",
    }),
    strategy: option({
      type: oneOf(["polling", "webhook"] as const),
      long: "strategy",
      description:
        "How the trigger fires: polled on a schedule, or delivered to a webhook",
      defaultValue: () => "polling" as const,
      defaultValueIsSerializable: true,
    }),
    ...debugArgs,
  },
  handler: async (args) => {
    const { startGeneratePieceTrigger } =
      await import("../services/generate-piece-trigger.js");
    await startGeneratePieceTrigger(args, process.cwd());
    process.exit(0);
  },
});
