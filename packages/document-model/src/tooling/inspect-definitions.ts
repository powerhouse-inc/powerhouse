import type {
  DefinitionDiagnosticV1,
  JsonValue,
} from "@powerhousedao/shared/document-model";
import { sortDefinitionDiagnostics } from "../definition/diagnostics.js";
import { canonicalJson, sha256 } from "../definition/primitives.js";
import { scalarEntries } from "../definition/scalars/index.js";
import {
  normalizeDefinitions,
  type DefinitionCheckOptions,
} from "./check-definitions.js";
import type {
  DefinitionInspectionReport,
  LoadedDefinitionInspectionRequest,
  ScalarInspectionReport,
} from "./types.js";

function selectionMatches(
  selection: LoadedDefinitionInspectionRequest["selection"],
  artifact: ReturnType<typeof normalizeDefinitions>["artifacts"][number],
): boolean {
  if (selection.kind !== artifact.kind || selection.key !== artifact.key) {
    return false;
  }
  return (
    selection.kind !== "document-model" ||
    (artifact.kind === "document-model" &&
      selection.version === artifact.version)
  );
}

export function inspectDefinitions(
  request: LoadedDefinitionInspectionRequest,
  options: DefinitionCheckOptions = {},
): DefinitionInspectionReport {
  const normalized = normalizeDefinitions(request, options);
  const base = {
    kind: "powerhouse.definition-inspection" as const,
    formatVersion: 1 as const,
    compilerVersion: request.compilerVersion,
    selection: request.selection,
    sourceSet: request.loadResult.sourceSet,
  };

  if (normalized.report.status !== "ok") {
    return {
      ...base,
      status: normalized.report.status,
      diagnostics: normalized.report.diagnostics,
    };
  }

  const matches = normalized.artifacts.filter((artifact) =>
    selectionMatches(request.selection, artifact),
  );
  if (matches.length !== 1) {
    const diagnostic: DefinitionDiagnosticV1 = {
      code:
        matches.length === 0
          ? "PH-INSPECT-DEFINITION-NOT-FOUND"
          : "PH-PKG-LOGICAL-COLLISION",
      severity: "error",
      phase: "package",
      definition: request.selection,
      path: [],
      message:
        matches.length === 0
          ? "The selected definition was not found in the configured source set."
          : "The selected definition is declared more than once.",
      repair:
        matches.length === 0
          ? "Select a document type, version, or subgraph name present in the check report."
          : "Remove duplicate sources for this logical definition.",
    };
    return {
      ...base,
      status: "invalid",
      diagnostics: sortDefinitionDiagnostics([
        ...normalized.report.diagnostics,
        diagnostic,
      ]),
    };
  }

  const match = matches[0];
  if (match.kind === "scalar") {
    throw new TypeError(
      "Definition inspection does not select scalar artifacts.",
    );
  }
  return {
    ...base,
    status: "ok",
    source: match.source,
    digest: match.digest,
    definition: match.definition,
    diagnostics: normalized.report.diagnostics,
  };
}

export function inspectScalarDefinition(
  name: string,
  compilerVersion: string,
): ScalarInspectionReport {
  const base = {
    kind: "powerhouse.scalar-inspection" as const,
    formatVersion: 1 as const,
    compilerVersion,
    selection: { kind: "scalar" as const, key: name },
  };
  const scalar = scalarEntries.find((entry) => entry.definition.name === name);
  if (!scalar) {
    return {
      ...base,
      status: "invalid",
      diagnostics: [
        {
          code: "PH-INSPECT-DEFINITION-NOT-FOUND",
          severity: "error",
          phase: "definition",
          definition: { kind: "scalar", key: name },
          path: ["name"],
          message: `Scalar ${name} is not present in the compiler catalog.`,
          repair: "Choose a scalar name from the compiler-owned catalog.",
        },
      ],
    };
  }
  const definition = scalar.definition;
  return {
    ...base,
    status: "ok",
    source: {
      specifier: "document-model#scalar-catalog",
      exportPath: [definition.name],
    },
    digest: sha256(canonicalJson(definition as unknown as JsonValue)),
    definition,
    coercionSource: definition.coercion.source,
    diagnostics: [],
  };
}
