import type {
  DefinitionCheckReport,
  DefinitionCheckSkipReason,
  DefinitionDiagnostic,
} from "@powerhousedao/shared/document-model";
import {
  type DefinitionInspectionReport,
  type DocumentModelInspection,
  formatDefinitionDiagnostic,
  formatDefinitionSource,
} from "document-model/tooling";

const SKIP_REASONS: Readonly<Record<DefinitionCheckSkipReason, string>> = {
  "no-document-models": "The models directory holds no document model",
};

const plural = (count: number, noun: string, nouns = `${noun}s`) =>
  `${count} ${count === 1 ? noun : nouns}`;

function statusLine(
  report: DefinitionCheckReport | DefinitionInspectionReport,
  counted: string,
): string {
  const { documentModelsDir, sources, stored } = report.sourceSet;
  return `${report.status}: ${counted} (${documentModelsDir}: ${plural(sources.length, "code-first entry", "code-first entries")}, ${plural(stored.length, "stored model")})`;
}

function skipped(reason: DefinitionCheckSkipReason | undefined): string[] {
  if (reason === undefined) return [];
  return [`${SKIP_REASONS[reason]}, so nothing was checked.`];
}

function diagnosticLines(
  diagnostics: readonly DefinitionDiagnostic[],
): string[] {
  const errors = diagnostics.filter(
    ({ severity }) => severity === "error",
  ).length;
  return [
    ...diagnostics.map(formatDefinitionDiagnostic),
    `${plural(errors, "error")}, ${plural(diagnostics.length - errors, "warning")}`,
  ];
}

export function renderCheckReport(report: DefinitionCheckReport): string {
  return [
    statusLine(report, plural(report.definitions.length, "definition")),
    ...skipped(report.skipReason),
    ...report.definitions.map(
      ({ kind, key, version, source }) =>
        `  ${kind} ${key}${version === undefined ? "" : ` v${version}`} ${formatDefinitionSource(source)}`,
    ),
    ...diagnosticLines(report.diagnostics),
  ].join("\n");
}

type FamilyInspection = DefinitionInspectionReport["families"][number];

function operationLine(
  operation: DocumentModelInspection["modules"][number]["operations"][number],
): string {
  const errors = operation.errors.map(({ key, code }) =>
    code === null ? key : `${key} (${code})`,
  );
  return [
    `      ${operation.actionType}`,
    operation.scope,
    `input ${operation.input ?? "none"}`,
    ...(errors.length === 0 ? [] : [`errors ${errors.join(", ")}`]),
  ].join("  ");
}

function versionLines(
  documentType: string,
  model: DocumentModelInspection,
): string[] {
  return [
    `  ${documentType}@${model.version}`,
    `    source ${formatDefinitionSource(model.source)}`,
    `    scopes global ${model.scopes.global}, local ${model.scopes.local ?? "none"}`,
    `    scalars ${
      model.scalars.length === 0
        ? "none"
        : model.scalars
            .map(({ name, implementation }) => `${name} (${implementation})`)
            .join(", ")
    }`,
    ...model.modules.flatMap((module) => [
      `    module ${module.name}`,
      ...module.operations.map(operationLine),
    ]),
  ];
}

function familyLines(family: FamilyInspection): string[] {
  const { identity, scalarCoercion, serialization } = family.compatibility;
  return [
    `${family.documentType} ${family.name} (${family.extension})`,
    `  digest ${family.digest}`,
    `  compatibility identity ${identity}, scalar coercion ${scalarCoercion}, serialization ${serialization}`,
    ...family.versions.flatMap((model) =>
      versionLines(family.documentType, model),
    ),
  ];
}

export function renderInspectionReport(
  report: DefinitionInspectionReport,
): string {
  return [
    statusLine(
      report,
      plural(
        report.families.reduce((sum, { versions }) => sum + versions.length, 0),
        "model",
      ),
    ),
    ...(report.status === "skipped"
      ? [
          "The models directory holds no document model, so there is nothing to inspect.",
        ]
      : []),
    ...report.families.flatMap(familyLines),
    ...(report.definition === undefined
      ? []
      : ["The full definition of this model is in --json, as `definition`."]),
    ...diagnosticLines(report.diagnostics),
  ].join("\n");
}
