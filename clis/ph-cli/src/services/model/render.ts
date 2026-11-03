import type {
  DefinitionCheckReport,
  DefinitionCheckSkipReason,
  DefinitionDiagnostic,
  DefinitionSource,
} from "@powerhousedao/shared/document-model";
import {
  type DefinitionInspectionReport,
  type DocumentModelInspection,
  formatDefinitionDiagnostic,
} from "document-model/tooling";

const SKIP_REASONS: Readonly<Record<DefinitionCheckSkipReason, string>> = {
  "explicit-schema-first-mode":
    'powerhouse.config.json sets definitionSources mode "schema-first"',
  "definition-sources-absent":
    "powerhouse.config.json declares no definitionSources",
  "definition-sources-empty": "definitionSources lists no entries",
};

const plural = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? "" : "s"}`;

function formatSource({ specifier, exportPath }: DefinitionSource): string {
  return exportPath === undefined
    ? specifier
    : `${specifier}#/${exportPath.join("/")}`;
}

function statusLine(
  report: DefinitionCheckReport | DefinitionInspectionReport,
  counted: string,
): string {
  const { mode, sources } = report.sourceSet;
  return `${report.status}: ${counted} (${mode}, ${plural(sources.length, "selected source")})`;
}

function skipped(reason: DefinitionCheckSkipReason | undefined): string[] {
  if (reason === undefined) return [];
  return [
    `${SKIP_REASONS[reason]} and the package has no stored document model, so nothing was checked.`,
  ];
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
        `  ${kind} ${key}${version === undefined ? "" : ` v${version}`} ${formatSource(source)}`,
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
    `    source ${formatSource(model.source)}`,
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
          "No code-first source is selected and the package has no stored document model, so there is nothing to inspect.",
        ]
      : []),
    ...report.families.flatMap(familyLines),
    ...(report.definition === undefined
      ? []
      : ["The full definition of this model is in --json, as `definition`."]),
    ...diagnosticLines(report.diagnostics),
  ].join("\n");
}
