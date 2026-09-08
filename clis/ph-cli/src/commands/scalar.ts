import { command, flag, positional, string, subcommands } from "cmd-ts";
import { getVersion } from "../get-version.js";

export const scalarInspect = command({
  name: "inspect",
  description: "Inspect one compiler-owned scalar declaration.",
  args: {
    name: positional({
      type: string,
      displayName: "name",
      description: "GraphQL scalar name",
    }),
    json: flag({
      long: "json",
      description: "Write one versioned JSON report to stdout",
      defaultValue: () => false,
      defaultValueIsSerializable: true,
    }),
  },
  handler: async (args) => {
    const [{ inspectScalarDefinition }, output] = await Promise.all([
      import("document-model/tooling"),
      import("../services/definition-output.js"),
    ]);
    const report = inspectScalarDefinition(args.name, getVersion());
    output.renderDefinitionReport(report, args.json === true);
    process.exitCode = output.definitionReportExitCode(report);
  },
});

export const scalar = subcommands({
  name: "scalar",
  description: "Inspect the compiler-owned scalar catalog.",
  cmds: { inspect: scalarInspect },
});
