import type { DefinitionDiagnosticV1 } from "@powerhousedao/shared/document-model";
import { canonicalJsonFromUnknown, compareCodeUnits } from "./primitives.js";

export const MAX_DIAGNOSTIC_CODE_POINTS = 512;

export type DefinitionIssue = {
  readonly code: `PH-${string}`;
  readonly message: string;
  readonly repair: string;
  readonly path?: readonly (string | number)[];
  readonly expected?: string;
  readonly received?: string;
};

export function capCodePoints(value: string): string {
  const points = [...value];
  if (points.length <= MAX_DIAGNOSTIC_CODE_POINTS) return value;
  return points.slice(0, MAX_DIAGNOSTIC_CODE_POINTS).join("");
}

export class DefinitionDiagnosticError extends Error {
  readonly code: `PH-${string}`;
  readonly path: readonly (string | number)[];
  readonly repair: string;
  readonly expected?: string;
  readonly received?: string;

  constructor(issue: DefinitionIssue) {
    super(capCodePoints(issue.message));
    this.name = "DefinitionDiagnosticError";
    this.code = issue.code;
    this.path = issue.path ? [...issue.path] : [];
    this.repair = capCodePoints(issue.repair);
    this.expected = issue.expected && capCodePoints(issue.expected);
    this.received = issue.received && capCodePoints(issue.received);
  }
}

export function failDefinition(issue: DefinitionIssue): never {
  throw new DefinitionDiagnosticError(issue);
}

type ComparableDefinitionSource = {
  readonly specifier: string;
  readonly exportPath?: readonly string[];
};

export function definitionSourceSortKey(
  source: ComparableDefinitionSource | undefined,
): string {
  return canonicalJsonFromUnknown(
    source === undefined ? null : [source.specifier, source.exportPath ?? null],
  );
}

export function definitionPathSortKey(
  path: readonly (string | number)[],
): string {
  return canonicalJsonFromUnknown(path);
}

export function compareDefinitionSources(
  left: ComparableDefinitionSource | undefined,
  right: ComparableDefinitionSource | undefined,
): number {
  return compareCodeUnits(
    definitionSourceSortKey(left),
    definitionSourceSortKey(right),
  );
}

export function compareDefinitionPaths(
  left: readonly (string | number)[],
  right: readonly (string | number)[],
): number {
  return compareCodeUnits(
    definitionPathSortKey(left),
    definitionPathSortKey(right),
  );
}

export function compareDefinitionDiagnostics(
  left: DefinitionDiagnosticV1,
  right: DefinitionDiagnosticV1,
): number {
  const source = compareDefinitionSources(left.source, right.source);
  if (source !== 0) return source;
  const pairs: readonly [string, string][] = [
    [
      canonicalJsonFromUnknown(left.definition ?? null),
      canonicalJsonFromUnknown(right.definition ?? null),
    ],
    [definitionPathSortKey(left.path), definitionPathSortKey(right.path)],
    [left.code, right.code],
    [canonicalJsonFromUnknown(left), canonicalJsonFromUnknown(right)],
  ];
  for (const [leftValue, rightValue] of pairs) {
    const result = compareCodeUnits(leftValue, rightValue);
    if (result !== 0) return result;
  }
  return 0;
}

export function sortDefinitionDiagnostics(
  diagnostics: readonly DefinitionDiagnosticV1[],
): readonly DefinitionDiagnosticV1[] {
  return [...diagnostics].sort(compareDefinitionDiagnostics);
}
