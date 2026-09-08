import { definitionSourceArgs } from "@powerhousedao/shared/clis/args";
import { command, flag, positional, string, subcommands } from "cmd-ts";
import { getVersion } from "../get-version.js";

export const subgraphInspect = command({
  name: "inspect",
  description: "Inspect one configured subgraph definition.",
  args: {
    name: positional({
      type: string,
      displayName: "name",
      description: "Stable subgraph name",
    }),
    ...definitionSourceArgs,
    json: flag({
      long: "json",
      description: "Write one versioned JSON report to stdout",
      defaultValue: () => false,
      defaultValueIsSerializable: true,
    }),
    warningsAsErrors: flag({
      long: "warnings-as-errors",
      description: "Make warnings invalidate the definition inspection",
      defaultValue: () => false,
      defaultValueIsSerializable: true,
    }),
  },
  handler: async (args) => {
    const [{ runDefinitionInspection }, output] = await Promise.all([
      import("../services/definition-check.js"),
      import("../services/definition-output.js"),
    ]);
    const report = await runDefinitionInspection({
      configFile: args.configFile,
      sources: args.sources,
      warningsAsErrors: args.warningsAsErrors,
      compilerVersion: getVersion(),
      selection: { kind: "subgraph", key: args.name },
    });
    output.renderDefinitionReport(report, args.json === true);
    process.exitCode = output.definitionReportExitCode(report);
  },
});

export const subgraphMigrate = command({
  name: "migrate",
  description: "Report or apply a reversible code-first subgraph migration.",
  args: {
    name: positional({
      type: string,
      displayName: "name",
      description: "Legacy subgraph directory under subgraphs/",
    }),
    toCode: flag({
      long: "to-code",
      description:
        "Render a verification-only code-first subgraph beside legacy source",
      defaultValue: () => false,
      defaultValueIsSerializable: true,
    }),
    apply: flag({
      long: "apply",
      description: "Write the candidate instead of only reporting it",
      defaultValue: () => false,
      defaultValueIsSerializable: true,
    }),
    json: flag({
      long: "json",
      description: "Write one versioned JSON report to stdout",
      defaultValue: () => false,
      defaultValueIsSerializable: true,
    }),
  },
  handler: async (args) => {
    const migration = await import("../services/subgraph-migrate.js");
    // --to-code is required rather than implied, matching `ph model migrate`
    // and leaving the flag namespace free for a later retirement mode.
    const report = args.toCode
      ? await migration.runSubgraphToCodeMigration({
          subgraph: args.name,
          apply: args.apply,
        })
      : migration.subgraphMigrationArgumentFailure({
          subgraph: args.name,
          code: "PH-MIGRATE-SUBGRAPH-MODE-REQUIRED",
          message: "Pass --to-code to select the code-first conversion.",
        });
    migration.renderSubgraphMigrationReport(report, args.json === true);
    process.exitCode = migration.subgraphMigrationExitCode(report);
  },
});

export const subgraph = subcommands({
  name: "subgraph",
  description: "Inspect and migrate subgraph definitions.",
  cmds: { inspect: subgraphInspect, migrate: subgraphMigrate },
});
