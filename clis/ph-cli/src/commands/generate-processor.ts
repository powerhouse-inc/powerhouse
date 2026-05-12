import { debugArgs } from "@powerhousedao/shared/clis/args";
import { PROCESSOR_APPS } from "@powerhousedao/shared/processors";
import type { Type } from "cmd-ts";
import {
  array,
  command,
  flag,
  multioption,
  oneOf,
  option,
  optional,
  string,
} from "cmd-ts";
import { Directory, File } from "cmd-ts/dist/cjs/batteries/fs.js";

const ProcessorAppType: Type<string[], ("connect" | "switchboard")[]> = {
  from(processorApps) {
    if (processorApps.length === 0) {
      throw new Error(
        `No arguments provided for processor apps. Must be "connect" and/or "switchboard"`,
      );
    }
    if (processorApps.length > 2) {
      throw new Error(
        `Too many arguments provided for processor apps. Must be "connect" and/or "switchboard"`,
      );
    }
    const allowed = new Set(PROCESSOR_APPS);
    if (
      !processorApps.every((p) => allowed.has(p as "connect" | "switchboard"))
    ) {
      throw new Error(
        `Processor apps can only be "connect" and/or "switchboard".`,
      );
    }
    return Promise.resolve(processorApps as ("connect" | "switchboard")[]);
  },
};
export const generateProcessorCmd = command({
  name: "processor",
  description: "Generate a processor",
  args: {
    name: option({
      type: optional(string),
      long: "name",
      short: "n",
      description: "The name of the processor to generate",
    }),
    type: option({
      type: oneOf(["analytics", "relationalDb"] as const),
      long: "type",
      description: "The type of processor to generate",
      defaultValue: () => "analytics" as const,
      defaultValueIsSerializable: true,
    }),
    documentTypes: multioption({
      type: array(string),
      long: "document-types",
      short: "t",
      description: "The document types the processor will run on",
      defaultValue: () => [],
      defaultValueIsSerializable: true,
    }),
    apps: multioption({
      long: "apps",
      type: ProcessorAppType,
      description:
        "Whether the processor will run in switchboard (nodejs), connect (browser), or both",
      defaultValue: () => ["switchboard" as const, "connect" as const],
      defaultValueIsSerializable: true,
    }),
    document: option({
      type: optional(File),
      long: "document",
      short: "d",
      description:
        "Path to a powerhouse/processor spec file (.phd or .json) to drive codegen",
    }),
    dir: option({
      type: optional(Directory),
      long: "dir",
      description:
        "Name of the directory of an existing processor to re-generate",
    }),
    all: flag({
      long: "all",
      short: "a",
      description: "Re-generate all existing processors in the current project",
    }),
    extract: flag({
      long: "extract",
      short: "x",
      description:
        "Write a powerhouse/processor spec for each existing processor into specs/processors/",
    }),
    ...debugArgs,
  },
  handler: async (args) => {
    const { startGenerateProcessor } =
      await import("../services/generate-processor.js");
    await startGenerateProcessor(args, process.cwd());
    process.exit(0);
  },
});
