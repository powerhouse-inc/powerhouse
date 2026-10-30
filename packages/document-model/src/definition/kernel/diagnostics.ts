import type {
  DefinitionDiagnostic,
  DefinitionDiagnosticPhase,
  DefinitionDiagnosticSeverity,
  DefinitionPath,
  DefinitionRef,
  DefinitionRelatedLocation,
  DefinitionSource,
} from "@powerhousedao/shared/document-model";
import { compareCodeUnits } from "./primitives.js";

export type DiagnosticCode = `PH-${string}`;

type DiagnosticCodeEntry = {
  readonly severity: DefinitionDiagnosticSeverity;
  readonly phase: DefinitionDiagnosticPhase;
  readonly meaning: string;
};

const MAX_SUMMARY_CODE_POINTS = 512;

export function capCodePoints(
  value: string,
  max: number = MAX_SUMMARY_CODE_POINTS,
): string {
  const points = [...value];
  const limit = Math.max(0, max);
  return points.length <= limit ? value : points.slice(0, limit).join("");
}

export type DefinitionDiagnosticInput<TCode extends string = DiagnosticCode> = {
  readonly code: TCode;
  readonly path: DefinitionPath;
  readonly message: string;
  readonly repair: string;
  readonly source?: DefinitionSource;
  readonly definition?: DefinitionRef;
  readonly expected?: string;
  readonly received?: string;
  readonly related?: readonly DefinitionRelatedLocation[];
};

function copySource(source: DefinitionSource): DefinitionSource {
  return {
    specifier: source.specifier,
    ...(source.exportPath !== undefined && {
      exportPath: [...source.exportPath],
    }),
  };
}

function copyDefinitionRef(definition: DefinitionRef): DefinitionRef {
  return {
    kind: definition.kind,
    key: definition.key,
    ...(definition.version !== undefined && { version: definition.version }),
  };
}

function createDiagnostic(
  input: DefinitionDiagnosticInput,
  { severity, phase }: DiagnosticCodeEntry,
): DefinitionDiagnostic {
  return {
    code: input.code,
    severity,
    phase,
    ...(input.source !== undefined && { source: copySource(input.source) }),
    ...(input.definition !== undefined && {
      definition: copyDefinitionRef(input.definition),
    }),
    path: [...input.path],
    message: input.message,
    ...(input.expected !== undefined && {
      expected: capCodePoints(input.expected),
    }),
    ...(input.received !== undefined && {
      received: capCodePoints(input.received),
    }),
    repair: input.repair,
    ...(input.related !== undefined && {
      related: input.related.map((location) => ({
        ...(location.source !== undefined && {
          source: copySource(location.source),
        }),
        path: [...location.path],
        message: location.message,
      })),
    }),
  };
}

export function describeReceived(value: unknown): string {
  if (value === null) return "null";
  try {
    return Array.isArray(value) ? "array" : typeof value;
  } catch {
    return "inspection-failed";
  }
}

/** The codes one layer emits, and the builders that fill in each code's severity and phase. */
export type DiagnosticCatalog<TCode extends DiagnosticCode> = {
  readonly codes: { readonly [K in TCode]: DiagnosticCodeEntry };
  create(input: DefinitionDiagnosticInput<TCode>): DefinitionDiagnostic;
  fail(input: DefinitionDiagnosticInput<TCode>): never;
};

/**
 * A layer's catalog: its own codes plus the codes of the catalog below it,
 * which already holds every lower layer's codes. A code keeps the meaning its
 * owning layer gave it, so an own code the lower catalog declares is refused.
 */
export function defineDiagnosticCatalog<
  TOwn extends DiagnosticCode = never,
  TLower extends DiagnosticCode = never,
>(
  own: { readonly [K in TOwn]: DiagnosticCodeEntry } & {
    readonly [K in NoInfer<TLower>]?: never;
  },
  lower?: DiagnosticCatalog<TLower>,
): DiagnosticCatalog<TOwn | TLower> {
  const lowerCodes: Readonly<Record<string, DiagnosticCodeEntry>> =
    lower?.codes ?? {};
  const ownEntries = Object.entries<DiagnosticCodeEntry>(own).map(
    ([code, entry]) => [code, Object.freeze({ ...entry })] as const,
  );
  const redefined = ownEntries
    .map(([code]) => code)
    .filter((code) => Object.hasOwn(lowerCodes, code));
  if (redefined.length > 0) {
    throw new TypeError(
      `Diagnostic code ${redefined.join(", ")} is already declared by a lower layer.`,
    );
  }
  const codes = Object.freeze({
    ...lowerCodes,
    ...Object.fromEntries(ownEntries),
  }) as { readonly [K in TOwn | TLower]: DiagnosticCodeEntry };
  const create = (input: DefinitionDiagnosticInput<TOwn | TLower>) =>
    createDiagnostic(input, codes[input.code]);
  return Object.freeze({
    codes,
    create,
    fail(input: DefinitionDiagnosticInput<TOwn | TLower>): never {
      throw new DefinitionError([create(input)]);
    },
  });
}

type Ordering = -1 | 0 | 1;

function compareNumbers(a: number, b: number): Ordering {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareOptional<T>(
  a: T | undefined,
  b: T | undefined,
  compare: (x: T, y: T) => Ordering,
): Ordering {
  if (a === undefined) return b === undefined ? 0 : -1;
  if (b === undefined) return 1;
  return compare(a, b);
}

function compareLists<T>(
  a: readonly T[],
  b: readonly T[],
  compare: (x: T, y: T) => Ordering,
): Ordering {
  const shared = Math.min(a.length, b.length);
  for (let index = 0; index < shared; index += 1) {
    const result = compare(a[index], b[index]);
    if (result !== 0) return result;
  }
  return compareNumbers(a.length, b.length);
}

function comparePathSegments(a: string | number, b: string | number): Ordering {
  if (typeof a === "number") {
    return typeof b === "number" ? compareNumbers(a, b) : -1;
  }
  if (typeof b === "number") return 1;
  return compareCodeUnits(a, b);
}

export function compareDefinitionPaths(
  a: DefinitionPath,
  b: DefinitionPath,
): Ordering {
  return compareLists(a, b, comparePathSegments);
}

function compareSources(a: DefinitionSource, b: DefinitionSource): Ordering {
  const specifier = compareCodeUnits(a.specifier, b.specifier);
  if (specifier !== 0) return specifier;
  return compareOptional(a.exportPath, b.exportPath, (x, y) =>
    compareLists(x, y, compareCodeUnits),
  );
}

function compareDefinitionRefs(a: DefinitionRef, b: DefinitionRef): Ordering {
  const kind = compareCodeUnits(a.kind, b.kind);
  if (kind !== 0) return kind;
  const key = compareCodeUnits(a.key, b.key);
  if (key !== 0) return key;
  return compareOptional(a.version, b.version, compareNumbers);
}

export function compareDefinitionDiagnostics(
  a: DefinitionDiagnostic,
  b: DefinitionDiagnostic,
): Ordering {
  const source = compareOptional(a.source, b.source, compareSources);
  if (source !== 0) return source;
  const definition = compareOptional(
    a.definition,
    b.definition,
    compareDefinitionRefs,
  );
  if (definition !== 0) return definition;
  const path = compareDefinitionPaths(a.path, b.path);
  if (path !== 0) return path;
  return compareCodeUnits(a.code, b.code);
}

export function sortDefinitionDiagnostics(
  diagnostics: readonly DefinitionDiagnostic[],
): readonly DefinitionDiagnostic[] {
  return [...diagnostics].sort(compareDefinitionDiagnostics);
}

function formatPointer(path: DefinitionPath): string {
  if (path.length === 0) return "(root)";
  return path
    .map(
      (segment) =>
        `/${String(segment).replaceAll("~", "~0").replaceAll("/", "~1")}`,
    )
    .join("");
}

function formatSource(source: DefinitionSource | undefined): string {
  if (source === undefined) return "(no source)";
  const exportPath = source.exportPath ?? [];
  return exportPath.length === 0
    ? source.specifier
    : `${source.specifier}#${formatPointer(exportPath)}`;
}

function formatDefinitionRef(definition: DefinitionRef | undefined): string {
  if (definition === undefined) return "";
  const version =
    definition.version === undefined ? "" : `@${definition.version}`;
  return ` ${definition.kind} ${definition.key}${version}`;
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, " ");
}

export function formatDefinitionDiagnostic(
  diagnostic: DefinitionDiagnostic,
): string {
  const where = `${formatSource(diagnostic.source)}${formatDefinitionRef(diagnostic.definition)} ${formatPointer(diagnostic.path)}`;
  const expected =
    diagnostic.expected === undefined
      ? ""
      : ` Expected: ${oneLine(diagnostic.expected)}`;
  const received =
    diagnostic.received === undefined
      ? ""
      : ` Received: ${oneLine(diagnostic.received)}`;
  const related = (diagnostic.related ?? [])
    .map(
      (location) =>
        ` Related: ${formatSource(location.source)} ${formatPointer(location.path)}: ${oneLine(location.message)}`,
    )
    .join("");
  return `${diagnostic.code} [${diagnostic.severity}/${diagnostic.phase}] ${where}: ${oneLine(diagnostic.message)}${expected}${received}${related} Repair: ${oneLine(diagnostic.repair)}`;
}

/**
 * @experimental Thrown when a code-first declaration is refused. `diagnostics`
 * holds every problem found, sorted, each with its code, path and repair.
 */
export class DefinitionError extends Error {
  readonly diagnostics: readonly DefinitionDiagnostic[];

  constructor(
    diagnostics: readonly [DefinitionDiagnostic, ...DefinitionDiagnostic[]],
  ) {
    if (diagnostics.length === 0) {
      throw new TypeError("DefinitionError requires at least one diagnostic.");
    }
    const sorted = sortDefinitionDiagnostics(diagnostics);
    const noun = sorted.length === 1 ? "diagnostic" : "diagnostics";
    super(
      [
        `Definition failed with ${sorted.length} ${noun}:`,
        ...sorted.map(formatDefinitionDiagnostic),
      ].join("\n"),
    );
    this.name = "DefinitionError";
    this.diagnostics = sorted;
  }
}
