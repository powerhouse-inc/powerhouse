import type {
  DefinitionDiagnostic,
  DefinitionPath,
  NamedGraphQLTypeDefinition,
} from "@powerhousedao/shared/document-model";
import { assignStoredSegments } from "../../../compiler/segments.js";
import {
  canonicalJson,
  compareCodeUnits,
  EMPTY_INPUT_FIELD_NAME,
} from "../../../kernel/primitives.js";
import type { NormalizedDocumentModelArtifact } from "../../adapters/types.js";
import {
  declaredTypeNames,
  type GraphQLDefinitionNode,
  structuredTypes,
} from "../../graphql/ast-to-structured.js";
import { parseSchema } from "../../graphql/parse-schema.js";
import { checkDiagnostics } from "../diagnostic-codes.js";
import {
  documentModelRef,
  servedSpecification,
} from "../../report/served-specification.js";
import { readStoredModel } from "../stored-specification.js";
import type { DefinitionCheck } from "../types.js";

type Segment = {
  readonly path: DefinitionPath;
  readonly stored: string;
  /** What the canonical printer puts in this segment. */
  readonly printed: readonly NamedGraphQLTypeDefinition[];
};

type Report = (
  path: DefinitionPath,
  message: string,
  expected: string,
  received: string,
) => void;

/**
 * SDL cannot spell an input without fields, a field key apart from its name,
 * or a member order that means nothing, so those are not compared.
 */
function comparable(type: NamedGraphQLTypeDefinition): string {
  if (type.kind === "enum") return canonicalJson(type);
  if (type.kind === "union") {
    return canonicalJson({
      ...type,
      members: [...type.members].sort(compareCodeUnits),
    });
  }
  const fields = type.fields.map((field) => {
    const { key: _key, ...rest } = field;
    return "args" in field && field.args !== undefined
      ? {
          ...rest,
          args: field.args.map(({ key: _argKey, ...arg }) => arg),
        }
      : rest;
  });
  const [only] = fields;
  const emptyMarker =
    type.kind === "input" &&
    fields.length === 1 &&
    only.name === EMPTY_INPUT_FIELD_NAME &&
    only.type.kind === "scalar" &&
    only.type.name === "Boolean" &&
    !only.type.required;
  return canonicalJson({
    ...type,
    ...("implements" in type &&
      type.implements !== undefined && {
        implements: [...type.implements].sort(compareCodeUnits),
      }),
    fields: emptyMarker ? [] : fields,
  });
}

function differs(
  stored: NamedGraphQLTypeDefinition,
  declared: NamedGraphQLTypeDefinition,
): boolean {
  return comparable(stored) !== comparable(declared);
}

/** The canonical printer owns each segment, so every segment holds exactly its printed types. */
function compareCanonical(
  report: Report,
  segment: Segment,
  stored: readonly NamedGraphQLTypeDefinition[],
): void {
  const expected = segment.printed.map(({ name }) => name);
  const received = stored.map(({ name }) => name);
  const missing = expected.find((name) => !received.includes(name));
  const surplus = received.find((name) => !expected.includes(name));
  if (missing !== undefined || surplus !== undefined) {
    report(
      segment.path,
      missing !== undefined
        ? `The stored schema segment does not declare ${missing}.`
        : `The stored schema segment declares ${surplus}, which the definition places elsewhere or not at all.`,
      expected.join(", "),
      received.join(", "),
    );
    return;
  }
  for (const declared of segment.printed) {
    const copy = stored.find(({ name }) => name === declared.name);
    if (copy === undefined || !differs(copy, declared)) continue;
    report(
      [...segment.path, declared.name],
      `The stored schema segment describes ${declared.name} differently than the definition.`,
      canonicalJson(declared),
      canonicalJson(copy),
    );
  }
}

type ParsedSegment = {
  readonly segment: Segment;
  readonly definitions: readonly GraphQLDefinitionNode[];
};

/**
 * A schema-first model keeps its own split, and a segment may extend a type
 * another declares, so the union of segments is folded and compared.
 */
function compareExplicit(
  report: Report,
  path: DefinitionPath,
  segments: readonly ParsedSegment[],
  declaration: ReadonlyMap<string, NamedGraphQLTypeDefinition>,
): void {
  const types = structuredTypes(
    segments.flatMap(({ definitions }) => definitions),
    new Set(declaration.keys()),
  );
  const segmentOf = (name: string): DefinitionPath =>
    segments.find(({ definitions }) => declaredTypeNames(definitions).has(name))
      ?.segment.path ?? path;
  const seen = new Set<string>();
  for (const type of types) {
    seen.add(type.name);
    const declared = declaration.get(type.name);
    if (declared === undefined) {
      report(
        segmentOf(type.name),
        `The stored schema segment declares ${type.name}, which the definition does not describe.`,
        [...declaration.keys()].join(", "),
        type.name,
      );
    } else if (differs(type, declared)) {
      report(
        [...segmentOf(type.name), type.name],
        `The stored schema segment describes ${type.name} differently than the definition.`,
        canonicalJson(declared),
        canonicalJson(type),
      );
    }
  }
  for (const name of declaration.keys()) {
    if (seen.has(name)) continue;
    report(
      path,
      `No stored schema segment declares ${name}.`,
      name,
      [...seen].join(", "),
    );
  }
}

function checkArtifact(
  artifact: NormalizedDocumentModelArtifact,
): readonly DefinitionDiagnostic[] {
  const served = servedSpecification(artifact);
  if (served === undefined) return [];
  const { specification, index } = served;
  const at: DefinitionPath = ["specifications", index];
  const diagnostics: DefinitionDiagnostic[] = [];
  const report: Report = (path, message, expected, received) =>
    diagnostics.push(
      checkDiagnostics.create({
        code: "PH-DEF-COMPATIBILITY-INVALID",
        source: artifact.source,
        definition: documentModelRef(artifact),
        path,
        message,
        expected,
        received,
        repair:
          "Export the module materialize returned, or save the model again from the document model editor; a stored string that describes another structure is a definition error.",
      }),
    );

  const operations = specification.modules.flatMap((module) =>
    module.operations.map((operation) => ({
      key: `${module.key}/${operation.key}`,
      input: operation.input,
    })),
  );
  const printed = assignStoredSegments({
    types: specification.types,
    globalRoot: specification.state.global.root.name,
    localRoot: specification.state.local.root?.name ?? null,
    operations,
  });
  const declaration = new Map<string, NamedGraphQLTypeDefinition>(
    [
      ...specification.types,
      ...operations.flatMap(({ input }) => (input === null ? [] : [input])),
    ].map((type) => [type.name, type]),
  );
  const stored = readStoredModel(artifact);
  if (!stored.ok) diagnostics.push(stored.diagnostic);
  const storedSpecification = stored.ok ? stored.served : undefined;
  const canonical =
    artifact.definition.compatibility.serialization === "canonical-v1";

  // The materializer writes every operation's segment; a schema-first
  // operation without an input may store none.
  const missing = new Map<string, string>();
  specification.modules.forEach((module, moduleIndex) =>
    module.operations.forEach((operation, operationIndex) => {
      if (canonical || operation.input !== null) {
        missing.set(
          `${moduleIndex}/${operationIndex}`,
          `${module.key}.${operation.key}`,
        );
      }
    }),
  );
  const segments: Segment[] = [];
  for (const { path, schema, of } of storedSpecification?.segments ?? []) {
    if ("scope" in of) {
      segments.push({ path, stored: schema, printed: printed[of.scope] });
      continue;
    }
    const module = specification.modules.at(of.module);
    const operation = module?.operations.at(of.operation);
    if (module === undefined || operation === undefined) {
      report(
        path,
        "The stored schema segment belongs to an operation the definition does not declare.",
        "a segment of a declared operation",
        schema,
      );
      continue;
    }
    missing.delete(`${of.module}/${of.operation}`);
    segments.push({
      path,
      stored: schema,
      printed:
        printed.operations.get(`${module.key}/${operation.key}`) ??
        (operation.input === null ? [] : [operation.input]),
    });
  }
  if (storedSpecification !== undefined) {
    for (const operation of missing.values()) {
      report(
        storedSpecification.path,
        `The stored model has no schema segment for operation ${operation}.`,
        `a schema segment for ${operation}`,
        "absent",
      );
    }
  }

  const parsed = segments.flatMap((segment): ParsedSegment[] => {
    const result = parseSchema(segment.stored);
    if (result.ok) {
      return [{ segment, definitions: result.document.definitions }];
    }
    report(
      segment.path,
      `The stored schema segment is not GraphQL SDL: ${result.message}`,
      "GraphQL SDL",
      segment.stored,
    );
    return [];
  });
  if (canonical) {
    const declared = new Set(declaration.keys());
    for (const { segment, definitions } of parsed) {
      compareCanonical(report, segment, structuredTypes(definitions, declared));
    }
  } else if (
    storedSpecification !== undefined &&
    parsed.length === segments.length
  ) {
    compareExplicit(report, storedSpecification.path, parsed, declaration);
  }

  for (const scope of ["global", "local"] as const) {
    const state = specification.state[scope];
    const text = state.materialized.initialValue;
    if (text.trim() === "") continue;
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      value = undefined;
    }
    const received = value === undefined ? text : canonicalJson(value);
    if (received === canonicalJson(state.initialValue)) continue;
    report(
      [...at, "state", scope, "initialValue"],
      `The stored ${scope} initial value describes a different value than the definition.`,
      canonicalJson(state.initialValue),
      received,
    );
  }
  return diagnostics;
}

/**
 * Hosts and codegen read the stored SDL strings; the definition carries the
 * structure. Every segment is checked: for a canonical model the strings are
 * the printer's output, so a mismatch is a forged module or a compiler defect.
 */
export const retainedSerializationCheck: DefinitionCheck = {
  name: "retained-serialization",
  run: ({ artifacts }) => artifacts.flatMap(checkArtifact),
};
