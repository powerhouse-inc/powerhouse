import type {
  DefinitionCheckReport,
  DefinitionCheckSkipReason,
} from "@powerhousedao/shared/document-model";
import { formatDefinitionDiagnostic } from "document-model/tooling";

const SKIP_REASONS: Record<DefinitionCheckSkipReason, string> = {
  "explicit-schema-first-mode": 'This package declares mode "schema-first"',
  "definition-sources-absent": "This package declares no definitionSources",
  "definition-sources-empty": "This package lists no definitionSources entries",
};

export function renderHuman(report: DefinitionCheckReport): string {
  const lines: string[] = [];
  const sources = report.sourceSet.sources.length;
  lines.push(
    `${report.status} (${report.profile} profile, ${report.sourceSet.mode}, ${sources} source${sources === 1 ? "" : "s"})`,
  );
  if (report.status === "skipped") {
    lines.push(
      `${SKIP_REASONS[report.skipReason]}, so no definition was checked. That is not release approval.`,
    );
  }
  for (const definition of report.definitions) {
    const version =
      definition.version === undefined ? "" : ` v${String(definition.version)}`;
    lines.push(`  ${definition.kind} ${definition.key}${version}`);
  }
  for (const diagnostic of report.diagnostics) {
    lines.push(formatDefinitionDiagnostic(diagnostic));
  }
  lines.push(
    `${report.summary.errors} error(s), ${report.summary.warnings} warning(s)`,
  );
  return lines.join("\n");
}
