import { definitionSourceArgs } from "@powerhousedao/shared/clis/args";
import {
  command,
  flag,
  option,
  optional,
  positional,
  string,
  subcommands,
} from "cmd-ts";
import { getVersion } from "../get-version.js";
import type { DefinitionCommandReport } from "../services/definition-output.js";

const json = flag({
  long: "json",
  description: "Write one versioned JSON report to stdout",
  defaultValue: () => false,
  defaultValueIsSerializable: true,
});

function warningsAsErrors(description: string) {
  return flag({
    long: "warnings-as-errors",
    description,
    defaultValue: () => false,
    defaultValueIsSerializable: true,
  });
}

const release = flag({
  long: "release",
  description: "Use the release check profile; required with --retained",
  defaultValue: () => false,
  defaultValueIsSerializable: true,
});

const retained = flag({
  long: "retained",
  description:
    "Validate the release report retained by the last ph build; requires --release",
  defaultValue: () => false,
  defaultValueIsSerializable: true,
});

export const modelCheck = command({
  name: "check",
  description: "Import and validate the configured definition sources.",
  args: {
    ...definitionSourceArgs,
    json,
    warningsAsErrors: warningsAsErrors(
      "Make warnings invalidate the definition check",
    ),
    release,
    retained,
    outDir: option({
      type: optional(string),
      long: "out-dir",
      description:
        "Directory containing the retained release report; requires --retained",
    }),
  },
  handler: async (args) => {
    const output = await import("../services/definition-output.js");
    let report: DefinitionCommandReport;
    if (args.retained === true && args.release !== true) {
      report = output.definitionCommandArgumentFailure({
        command: "model.check",
        code: "PH-CLI-OPTION-REQUIRED",
        path: ["retained"],
        message: "--retained requires the release check profile.",
        expected: "--release --retained",
        received: "--retained",
        repair: "Add --release or remove --retained.",
      });
    } else if (args.retained !== true && args.outDir !== undefined) {
      report = output.definitionCommandArgumentFailure({
        command: "model.check",
        code: "PH-CLI-OPTION-INCOMPATIBLE",
        path: ["outDir"],
        message: "--out-dir only selects a retained report directory.",
        expected: "--retained --out-dir <directory>",
        received: `--out-dir ${args.outDir}`,
        repair: "Add --release --retained or remove --out-dir.",
      });
    } else if (args.retained === true) {
      const { consumeRetainedDefinitionCheck } =
        await import("../services/definition-release.js");
      report =
        (await consumeRetainedDefinitionCheck({
          configFile: args.configFile,
          sources: args.sources,
          outDir: args.outDir ?? "dist",
          warningsAsErrors: args.warningsAsErrors,
        })) ??
        output.definitionCommandArgumentFailure({
          command: "model.check",
          code: "PH-CLI-RETAINED-REPORT-UNAVAILABLE",
          path: ["retained"],
          message: "The retained release report was unavailable.",
          expected: "A retained report from a successful ph build",
          received: "No retained report",
          repair: "Run ph build successfully, then retry the retained check.",
        });
    } else {
      const { runDefinitionCheck } =
        await import("../services/definition-check.js");
      report = await runDefinitionCheck({
        configFile: args.configFile,
        sources: args.sources,
        profile: args.release === true ? "release" : "edit",
        warningsAsErrors: args.warningsAsErrors,
      });
    }
    output.renderDefinitionReport(report, args.json === true);
    process.exitCode = output.definitionReportExitCode(report);
  },
});

export const modelInspect = command({
  name: "inspect",
  description: "Inspect one configured document-model definition.",
  args: {
    selector: positional({
      type: string,
      displayName: "documentType@version",
      description: "Document type and positive integer module version",
    }),
    ...definitionSourceArgs,
    json,
    warningsAsErrors: warningsAsErrors(
      "Make warnings invalidate the definition inspection",
    ),
  },
  handler: async (args) => {
    const output = await import("../services/definition-output.js");
    const separator = args.selector.lastIndexOf("@");
    const key = args.selector.slice(0, separator);
    const version = Number(args.selector.slice(separator + 1));
    if (
      separator < 1 ||
      !Number.isSafeInteger(version) ||
      version < 1 ||
      String(version) !== args.selector.slice(separator + 1)
    ) {
      const report = output.definitionCommandArgumentFailure({
        command: "model.inspect",
        code: "PH-INSPECT-SELECTOR-INVALID",
        path: ["selector"],
        message:
          "Model selector must use <documentType>@<positive-integer-version>.",
        expected: "<documentType>@<positive-integer-version>",
        received: args.selector,
        repair: "Pass a document type and positive integer module version.",
      });
      output.renderDefinitionReport(report, args.json === true);
      process.exitCode = output.definitionReportExitCode(report);
      return;
    }
    const { runDefinitionInspection } =
      await import("../services/definition-check.js");
    const report = await runDefinitionInspection({
      configFile: args.configFile,
      sources: args.sources,
      warningsAsErrors: args.warningsAsErrors,
      compilerVersion: getVersion(),
      selection: { kind: "document-model", key, version },
    });
    output.renderDefinitionReport(report, args.json === true);
    process.exitCode = output.definitionReportExitCode(report);
  },
});

export const modelMigrate = command({
  name: "migrate",
  description: "Report or apply a reversible per-family code-first migration.",
  args: {
    family: positional({
      type: string,
      displayName: "family",
      description: "Legacy family directory under document-models/",
    }),
    toCode: flag({
      long: "to-code",
      description:
        "Render a verification-only code-first family beside legacy source",
      defaultValue: () => false,
      defaultValueIsSerializable: true,
    }),
    retireLegacy: flag({
      long: "retire-legacy",
      description: "Create or consume a hash-bound legacy retirement plan",
      defaultValue: () => false,
      defaultValueIsSerializable: true,
    }),
    apply: flag({
      long: "apply",
      description: "Apply the selected write or approved retirement plan",
      defaultValue: () => false,
      defaultValueIsSerializable: true,
    }),
    plan: option({
      type: optional(string),
      long: "plan",
      description:
        "Approved retirement-plan JSON path (required for retirement apply)",
    }),
    json,
  },
  handler: async (args) => {
    const migration = await import("../services/model-migrate.js");
    let report;
    if (Number(args.toCode) + Number(args.retireLegacy) !== 1) {
      report = migration.modelMigrationArgumentFailure({
        family: args.family,
        code: "PH-MIGRATE-MODE-REQUIRED",
        message: "Select exactly one of --to-code or --retire-legacy.",
      });
    } else if (
      args.plan !== undefined &&
      (args.toCode || args.apply !== true)
    ) {
      report = migration.modelMigrationArgumentFailure({
        family: args.family,
        code: "PH-MIGRATE-PLAN-UNEXPECTED",
        message: "--plan is accepted only with --retire-legacy --apply.",
      });
    } else if (args.toCode) {
      report = await migration.runToCodeMigration({
        family: args.family,
        apply: args.apply,
      });
    } else {
      report = await migration.runRetireLegacyMigration({
        family: args.family,
        apply: args.apply,
        ...(args.plan === undefined ? {} : { planPath: args.plan }),
      });
    }
    migration.renderModelMigrationReport(report, args.json === true);
    process.exitCode = migration.modelMigrationExitCode(report);
  },
});

export const model = subcommands({
  name: "model",
  description: "Check, inspect, and migrate document-model definitions.",
  cmds: {
    check: modelCheck,
    inspect: modelInspect,
    migrate: modelMigrate,
  },
});
