import type {
  DefinitionCheckReport,
  DefinitionCheckSkipReason,
  DefinitionDiagnostic,
} from "@powerhousedao/shared/document-model";
import { compareDefinitionDiagnostics } from "../../kernel/diagnostics.js";
import { canonicalJson, compareCodeUnits } from "../../kernel/primitives.js";
import type { NormalizedDocumentModelArtifact } from "../adapters/types.js";
import type { DefinitionSourceSet } from "../definition-source-types.js";

export type DefinitionStatus = DefinitionCheckReport["status"];

/** These phases mean the tool could not read the package, not that a model is wrong. */
const FAILURE_PHASES: ReadonlySet<string> = new Set([
  "configuration",
  "import",
]);

/** Drops exact repeats and orders the rest independently of input order. */
export function sortedUniqueDiagnostics(
  diagnostics: readonly DefinitionDiagnostic[],
): readonly DefinitionDiagnostic[] {
  const unique = new Map<string, DefinitionDiagnostic>();
  for (const diagnostic of diagnostics) {
    unique.set(canonicalJson(diagnostic), diagnostic);
  }
  return [...unique]
    .sort(
      ([leftKey, left], [rightKey, right]) =>
        compareDefinitionDiagnostics(left, right) ||
        compareCodeUnits(leftKey, rightKey),
    )
    .map(([, diagnostic]) => diagnostic);
}

export function definitionStatus(input: {
  readonly skipReason?: DefinitionCheckSkipReason;
  readonly definitions: readonly unknown[];
  readonly diagnostics: readonly DefinitionDiagnostic[];
}): DefinitionStatus {
  const errors = input.diagnostics.filter(
    ({ severity }) => severity === "error",
  );
  if (errors.some(({ phase }) => FAILURE_PHASES.has(phase))) return "failed";
  if (errors.length > 0) return "invalid";
  if (
    input.skipReason !== undefined &&
    input.definitions.length === 0 &&
    input.diagnostics.length === 0
  ) {
    return "skipped";
  }
  return "ok";
}

export function compareArtifacts(
  left: NormalizedDocumentModelArtifact,
  right: NormalizedDocumentModelArtifact,
): number {
  return (
    compareCodeUnits(left.documentType, right.documentType) ||
    left.version - right.version ||
    compareCodeUnits(left.source.specifier, right.source.specifier) ||
    compareCodeUnits(
      canonicalJson(left.source.exportPath ?? []),
      canonicalJson(right.source.exportPath ?? []),
    )
  );
}

type InventoryEntry = DefinitionCheckReport["definitions"][number];

/** The artifact order, extended to every kind of inventory entry. */
function compareInventoryEntries(
  left: InventoryEntry,
  right: InventoryEntry,
): number {
  return (
    compareCodeUnits(left.key, right.key) ||
    (left.version ?? 0) - (right.version ?? 0) ||
    compareCodeUnits(left.source.specifier, right.source.specifier) ||
    compareCodeUnits(
      canonicalJson(left.source.exportPath ?? []),
      canonicalJson(right.source.exportPath ?? []),
    ) ||
    compareCodeUnits(left.kind, right.kind)
  );
}

/** Builds the stored check report. Profile is `edit`: release checks come later. */
export function definitionCheckReport(input: {
  readonly sourceSet: DefinitionSourceSet;
  readonly skipReason?: DefinitionCheckSkipReason;
  readonly artifacts: readonly NormalizedDocumentModelArtifact[];
  /** Inventory entries besides the artifacts. */
  readonly definitions: readonly InventoryEntry[];
  readonly diagnostics: readonly DefinitionDiagnostic[];
}): DefinitionCheckReport {
  const diagnostics = sortedUniqueDiagnostics(input.diagnostics);
  const definitions = [
    ...input.artifacts.map((artifact): InventoryEntry => ({
      kind: "document-model",
      key: artifact.documentType,
      version: artifact.version,
      digest: artifact.digest,
      source: artifact.source,
    })),
    ...input.definitions,
  ].sort(compareInventoryEntries);
  const status = definitionStatus({
    ...(input.skipReason !== undefined && { skipReason: input.skipReason }),
    definitions,
    diagnostics,
  });
  const errors = diagnostics.filter(
    ({ severity }) => severity === "error",
  ).length;
  const common = {
    kind: "powerhouse.definition-check",
    formatVersion: 1,
    profile: "edit",
    sourceSet: input.sourceSet,
    definitions,
    diagnostics,
    summary: { errors, warnings: diagnostics.length - errors },
  } as const;
  if (status === "skipped") {
    // definitionStatus answers skipped only when a skip reason is present.
    return {
      ...common,
      status,
      skipReason: input.skipReason as DefinitionCheckSkipReason,
    };
  }
  return { ...common, status };
}
