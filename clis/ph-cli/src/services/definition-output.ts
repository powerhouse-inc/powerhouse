import type {
  DefinitionCheckReport,
  DefinitionInspectionReport,
  DefinitionSourceDiagnostic,
  ScalarInspectionReport,
} from "document-model/tooling";

export type DefinitionCommandFailureReport = {
  readonly kind: "powerhouse.definition-command";
  readonly formatVersion: 1;
  readonly command: "model.check" | "model.inspect";
  readonly status: "invalid";
  readonly diagnostics: readonly DefinitionSourceDiagnostic[];
};

export type DefinitionCommandReport =
  | DefinitionCheckReport
  | DefinitionInspectionReport
  | ScalarInspectionReport
  | DefinitionCommandFailureReport;

export function definitionCommandArgumentFailure(request: {
  readonly command: DefinitionCommandFailureReport["command"];
  readonly code: `PH-${string}`;
  readonly path: readonly (string | number)[];
  readonly message: string;
  readonly expected: string;
  readonly received: string;
  readonly repair: string;
}): DefinitionCommandFailureReport {
  return {
    kind: "powerhouse.definition-command",
    formatVersion: 1,
    command: request.command,
    status: "invalid",
    diagnostics: [
      {
        code: request.code,
        severity: "error",
        phase: "configuration",
        path: request.path,
        message: request.message,
        expected: request.expected,
        received: request.received,
        repair: request.repair,
      },
    ],
  };
}

export function definitionReportExitCode(
  report: DefinitionCommandReport,
): 0 | 1 | 2 {
  if (report.status === "ok" || report.status === "skipped") return 0;
  return report.status === "invalid" ? 1 : 2;
}

export function renderDefinitionReport(
  report: DefinitionCommandReport,
  json: boolean,
): void {
  if (json) {
    process.stdout.write(`${JSON.stringify(report)}\n`);
    return;
  }

  if (report.status === "ok") {
    if ("definition" in report) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      process.stdout.write(
        `Definition check passed (${report.definitions.length} definition${report.definitions.length === 1 ? "" : "s"}).\n`,
      );
    }
    return;
  }

  if (report.status === "skipped") {
    process.stdout.write("Definition check skipped: explicit legacy mode.\n");
    return;
  }

  for (const diagnostic of report.diagnostics) {
    const source =
      diagnostic.source?.specifier ??
      (report.kind === "powerhouse.definition-command"
        ? "<command>"
        : "<config>");
    const path = diagnostic.path.length
      ? `/${diagnostic.path.map(String).join("/")}`
      : "";
    process.stderr.write(
      `${diagnostic.severity.toUpperCase()} ${diagnostic.code} ${source}${path}\n${diagnostic.message}\nRepair: ${diagnostic.repair}\n`,
    );
  }
}
