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

type CatalogEntry = {
  readonly severity: DefinitionDiagnosticSeverity;
  readonly phase: DefinitionDiagnosticPhase;
  readonly meaning: string;
};

const catalog = {
  "PH-CONFIG-SOURCES-MISSING": {
    severity: "error",
    phase: "configuration",
    meaning: "No nonempty V1 definition-source list was selected",
  },
  "PH-CONFIG-VERSION-UNSUPPORTED": {
    severity: "error",
    phase: "configuration",
    meaning: "definitionSources.formatVersion is absent from the supported set",
  },
  "PH-CONFIG-SOURCE-INVALID": {
    severity: "error",
    phase: "configuration",
    meaning: "A source spelling or export pointer is malformed",
  },
  "PH-CONFIG-SOURCE-OUTSIDE-PACKAGE": {
    severity: "error",
    phase: "configuration",
    meaning:
      "A normalized path or symlink target leaves the selected package root",
  },
  "PH-CONFIG-DUPLICATE-SOURCE": {
    severity: "error",
    phase: "configuration",
    meaning:
      "Two configured entries resolve to the same module ID and export path",
  },
  "PH-IMPORT-FAILED": {
    severity: "error",
    phase: "import",
    meaning:
      "One configured source could not be imported; independent roots were still checked",
  },
  "PH-DEF-FIELD-OPTION-UNSUPPORTED": {
    severity: "error",
    phase: "definition",
    meaning: "A field use contains a validation option other than required",
  },
  "PH-DEF-TYPE-AS-FIELD": {
    severity: "error",
    phase: "definition",
    meaning: "A named type is used as a field without ph.ref",
  },
  "PH-DEF-OPTION-INVALID": {
    severity: "error",
    phase: "definition",
    meaning:
      "A builder option is malformed: wrong type, accessor, symbol key, non-plain object, or an explicit undefined default",
  },
  "PH-DEF-NAME-INVALID": {
    severity: "error",
    phase: "definition",
    meaning:
      "An authored GraphQL type, field, or enum value name is lexically invalid or reserved",
  },
  "PH-DEF-FIELD-INVALID": {
    severity: "error",
    phase: "definition",
    meaning:
      "A field position holds a value that is neither a field use nor a named type",
  },
  "PH-DEF-REFERENCE-TARGET-INVALID": {
    severity: "error",
    phase: "definition",
    meaning:
      "A ph.ref target is not a named type: a field use, another reference, undefined, or an anonymous input",
  },
  "PH-DEF-ENUM-VALUES-INVALID": {
    severity: "error",
    phase: "definition",
    meaning:
      "An enum declares no values, a duplicate value, or a reserved value",
  },
  "PH-DEF-UNION-MEMBERS-INVALID": {
    severity: "error",
    phase: "definition",
    meaning:
      "A union declares no members, a duplicate member, or a member that is not a ph.object",
  },
  "PH-DEF-IMPLEMENTS-INVALID": {
    severity: "error",
    phase: "definition",
    meaning:
      "An object implements something that is not a ph.interface, or the same interface twice",
  },
  "PH-SCALAR-DECLARATION-INVALID": {
    severity: "error",
    phase: "definition",
    meaning:
      "A compiler scalar declaration is malformed: name, description, validator, or coercion shape",
  },
  "PH-DM-DUPLICATE-ACTION": {
    severity: "error",
    phase: "definition",
    meaning: "Two operations derive the same persisted action type",
  },
  "PH-DM-DUPLICATE-NAME": {
    severity: "error",
    phase: "definition",
    meaning:
      "Two declarations derive the same module, GraphQL type, or creator name",
  },
  "PH-DM-IDENTITY-REUSED": {
    severity: "warning",
    phase: "definition",
    meaning:
      "Report-only: an installed specification reuses one stored ID for two declarations",
  },
  "PH-DM-IDENTITY-INVALID": {
    severity: "error",
    phase: "definition",
    meaning:
      "An identity segment, compatibility ID, or derived UUID violates the V1 contract",
  },
  "PH-DM-STATE-ROOT-INVALID": {
    severity: "error",
    phase: "definition",
    meaning:
      "A required state root is absent, is not an object, or has the wrong canonical name",
  },
  "PH-DM-SCOPE-UNSUPPORTED": {
    severity: "error",
    phase: "definition",
    meaning: "A definition requests a scope outside global or local",
  },
  "PH-DM-DECLARATION-INVALID": {
    severity: "error",
    phase: "definition",
    meaning:
      "A model, module, operation, error, example, version, or family declaration member is absent, malformed, unsupported, or forged",
  },
  "PH-DM-INITIAL-VALUE-INVALID": {
    severity: "error",
    phase: "definition",
    meaning:
      "A scope initial value cannot produce a stored JSON string, or its own state validator rejects it",
  },
  "PH-DM-TYPE-POSITION-INVALID": {
    severity: "error",
    phase: "definition",
    meaning:
      "An input type is referenced from an output position, or an output type from an input position",
  },
  "PH-DM-DEFAULT-UNSUPPORTED": {
    severity: "error",
    phase: "definition",
    meaning:
      "A document state or action input field declares a GraphQL default value",
  },
  "PH-DM-COMPATIBILITY-INVALID": {
    severity: "error",
    phase: "definition",
    meaning:
      "Compatibility data disagrees with the authored declaration or is malformed",
  },
  "PH-SG-DEFINITION-INVALID": {
    severity: "error",
    phase: "definition",
    meaning:
      "A published subgraph definition does not match the closed wire shape",
  },
  "PH-SG-SCHEMA-INVALID": {
    severity: "error",
    phase: "composition",
    meaning:
      "A subgraph's host-augmented schema does not build or does not validate",
  },
  "PH-SG-ENTRY-INVALID": {
    severity: "error",
    phase: "definition",
    meaning:
      "A subgraph entry is malformed, forged, or missing a resolver the builder requires",
  },
  "PH-SG-COMPUTED-FIELD-INVALID": {
    severity: "error",
    phase: "definition",
    meaning:
      "A computed field is malformed, unbound, bound twice, or bound where it does not exist",
  },
  "PH-GQL-COORDINATE-OWNED": {
    severity: "warning",
    phase: "composition",
    meaning:
      "Report-only: two subgraphs own one coordinate under the later PH-COMP-1 policy",
  },
  "PH-GQL-SHARED-DEFINITION-MISMATCH": {
    severity: "warning",
    phase: "composition",
    meaning:
      "Report-only: repeated shared definitions differ under that later policy",
  },
  "PH-GQL-FEDERATION-UNSUPPORTED": {
    severity: "error",
    phase: "composition",
    meaning:
      "A core-v1 code-first subgraph requests Federation 2 authoring semantics",
  },
  "PH-SCALAR-AUTHOR-DECLARATION-UNSUPPORTED": {
    severity: "error",
    phase: "definition",
    meaning:
      "A definition source exports a scalar defineScalar did not compile, or a catalog scalar as its own",
  },
  "PH-SCALAR-DUPLICATE-NAME": {
    severity: "error",
    phase: "package",
    meaning:
      "Two scalar declarations claim one name: a catalog entry twice, a package scalar under a catalog or built-in name, or two different package scalars",
  },
  "PH-SCALAR-UNREGISTERED": {
    severity: "warning",
    phase: "composition",
    meaning:
      "Report-only: current SDL reaches a scalar absent from catalog metadata",
  },
  "PH-SCALAR-RESOLVER-SHADOWED": {
    severity: "warning",
    phase: "composition",
    meaning: "Report-only: an authored resolver uses a catalog scalar name",
  },
  "PH-SCALAR-COERCION-NORMALIZES": {
    severity: "warning",
    phase: "definition",
    meaning:
      "X-scalar: a strict coercion returns a value different from its accepted input",
  },
  "PH-SCALAR-VALUE-NOT-JSON": {
    severity: "warning",
    phase: "definition",
    meaning:
      "X-scalar: a strict persistable declaration accepts a non-JSON value",
  },
  "PH-SCALAR-ZERO-VALUE-INVALID": {
    severity: "error",
    phase: "definition",
    meaning:
      "A zero value is absent, or a declared value its own coercion rejects",
  },
  "PH-SCALAR-POSITION-UNSUPPORTED": {
    severity: "warning",
    phase: "definition",
    meaning:
      "X-scalar: a later profile rejects a scalar from a persisted position",
  },
  "PH-SCALAR-FACTORY-AS-FIELD": {
    severity: "error",
    phase: "definition",
    meaning:
      "A scalar field-use factory is used as a field without being called",
  },
  "PH-PKG-LOGICAL-COLLISION": {
    severity: "error",
    phase: "package",
    meaning:
      "Distinct package values have the same model, manifest, or subgraph logical key",
  },
  "PH-PKG-DEFINITION-UNRECOGNIZED": {
    severity: "error",
    phase: "package",
    meaning: "A selected source exports no finalized definition",
  },
  "PH-PKG-DEFINITION-UNINSPECTABLE": {
    severity: "error",
    phase: "package",
    meaning:
      "A selected export could not be read: an accessor, a Proxy, or another property-read side effect",
  },
  "PH-PKG-TYPECHECK-FAILED": {
    severity: "error",
    phase: "typecheck",
    meaning: "The release profile's TypeScript build did not succeed",
  },
  "PH-PKG-RELEASE-EVIDENCE-MISSING": {
    severity: "error",
    phase: "package",
    meaning:
      "A release check ran without a required typecheck or packed-consumer verification",
  },
  "PH-PKG-PACKED-CONSUMER-FAILED": {
    severity: "error",
    phase: "package",
    meaning:
      "A real packed Node or browser consumer could not import the candidate output",
  },
  "PH-REPLAY-DIVERGENCE": {
    severity: "error",
    phase: "replay",
    meaning:
      "Schema-first and code-first results differ at a named history coordinate",
  },
  "PH-AUTH-UNSUPPORTED": {
    severity: "error",
    phase: "authorization",
    meaning: "A document model declares authorization, which core v1 rejects",
  },
} as const satisfies Record<`PH-${string}`, CatalogEntry>;

for (const entry of Object.values(catalog)) {
  Object.freeze(entry);
}

export const DEFINITION_DIAGNOSTIC_CODES: Readonly<typeof catalog> =
  Object.freeze(catalog);

export type DefinitionDiagnosticCode = keyof typeof DEFINITION_DIAGNOSTIC_CODES;

export const MAX_SUMMARY_CODE_POINTS = 512;

export function capCodePoints(
  value: string,
  max: number = MAX_SUMMARY_CODE_POINTS,
): string {
  const points = [...value];
  const limit = Math.max(0, max);
  return points.length <= limit ? value : points.slice(0, limit).join("");
}

export type DefinitionDiagnosticInput = {
  readonly code: DefinitionDiagnosticCode;
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

export function createDiagnostic(
  input: DefinitionDiagnosticInput,
): DefinitionDiagnostic {
  const { severity, phase } = DEFINITION_DIAGNOSTIC_CODES[input.code];
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

export function failDefinition(input: DefinitionDiagnosticInput): never {
  throw new DocumentModelDefinitionError([createDiagnostic(input)]);
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
  if (source === undefined) return "<config>";
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
 * Collects every diagnostic one compilation produces and throws them as a
 * single sorted `DocumentModelDefinitionError`. A `ph` builder invoked during
 * compilation still fails fast; `capture` folds that one diagnostic into the
 * same report instead of losing the diagnostics already collected.
 */
export class DefinitionDiagnosticCollector {
  #diagnostics: DefinitionDiagnostic[] = [];
  readonly #definition: DefinitionRef | undefined;

  constructor(definition?: DefinitionRef) {
    this.#definition = definition;
  }

  get size(): number {
    return this.#diagnostics.length;
  }

  get diagnostics(): readonly DefinitionDiagnostic[] {
    return sortDefinitionDiagnostics(this.#diagnostics);
  }

  add(input: DefinitionDiagnosticInput): void {
    this.#diagnostics.push(
      createDiagnostic({
        ...(this.#definition !== undefined && {
          definition: this.#definition,
        }),
        ...input,
      }),
    );
  }

  merge(diagnostics: readonly DefinitionDiagnostic[]): void {
    for (const diagnostic of diagnostics) {
      this.#diagnostics.push(
        this.#definition === undefined || diagnostic.definition !== undefined
          ? diagnostic
          : { ...diagnostic, definition: copyDefinitionRef(this.#definition) },
      );
    }
  }

  /** Runs `attempt`, collecting a thrown definition error instead of propagating it. */
  capture<T>(attempt: () => T): T | undefined {
    try {
      return attempt();
    } catch (error) {
      if (!(error instanceof DocumentModelDefinitionError)) throw error;
      this.merge(error.diagnostics);
      return undefined;
    }
  }

  /**
   * Throws one error carrying every collected diagnostic, or returns. Only an
   * `error` fails a declaration: several catalog codes are report-only, and a
   * warning must not turn into a hard failure at module evaluation.
   */
  throwIfFailed(): void {
    if (!this.#diagnostics.some((entry) => entry.severity === "error")) return;
    throw new DocumentModelDefinitionError(
      this.#diagnostics as [DefinitionDiagnostic, ...DefinitionDiagnostic[]],
    );
  }
}

export class DocumentModelDefinitionError extends Error {
  readonly diagnostics: readonly DefinitionDiagnostic[];

  constructor(
    diagnostics: readonly [DefinitionDiagnostic, ...DefinitionDiagnostic[]],
  ) {
    if (diagnostics.length === 0) {
      throw new TypeError(
        "DocumentModelDefinitionError requires at least one diagnostic.",
      );
    }
    const sorted = sortDefinitionDiagnostics(diagnostics);
    const noun = sorted.length === 1 ? "diagnostic" : "diagnostics";
    super(
      [
        `Document model definition failed with ${sorted.length} ${noun}:`,
        ...sorted.map(formatDefinitionDiagnostic),
      ].join("\n"),
    );
    this.name = "DocumentModelDefinitionError";
    this.diagnostics = sorted;
  }
}
