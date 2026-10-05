import type {
  DefinitionDiagnostic,
  DefinitionPath,
  DocumentModelDefinition,
  DocumentModelPHState,
  NamedGraphQLTypeDefinition,
} from "@powerhousedao/shared/document-model";
import { DefinitionDiagnosticCollector } from "../diagnostics.js";
import { canonicalJson, EMPTY_INPUT_FIELD_NAME } from "../primitives.js";
import { assignStoredSegments } from "../segments.js";
import { structuredTypesFromDocument } from "./ast-to-structured.js";
import { schemaFirstGraphQLDocument } from "./graphql-document.js";

/**
 * Checks that every retained stored string still describes the structure the
 * declaration describes.
 *
 * A serialization override keeps bytes a canonical printer cannot reproduce —
 * hand-authored indentation, a different definition order, a trailing comma.
 * It is not permission to store something else. This is where that promise is
 * verified, and it runs in tooling because it parses: merely importing a
 * declaration with retained SDL is not publication approval.
 */

/**
 * Drops the `_empty: Boolean` an empty input is printed as.
 *
 * SDL has no syntax for an input with no fields, so the printer projects that
 * marker field and a parser reads it straight back. Comparing the parsed type
 * to the declaration without removing it again would make every operation that
 * takes no input — a "clear", a "reset", an "archive" — fail its own retained
 * segment. Applied to both sides, so an input whose single authored field
 * really is called `_empty` is not judged against a stripped copy of itself.
 */
function withoutEmptyMarker(
  type: NamedGraphQLTypeDefinition,
): NamedGraphQLTypeDefinition {
  if (type.kind !== "input" || type.fields.length !== 1) return type;
  const [field] = type.fields;
  return field.name === EMPTY_INPUT_FIELD_NAME &&
    field.type.kind === "scalar" &&
    field.type.name === "Boolean" &&
    !field.type.required
    ? { ...type, fields: [] }
    : type;
}

type Segment = {
  readonly path: DefinitionPath;
  readonly stored: string;
  readonly expected: readonly NamedGraphQLTypeDefinition[];
};

function compareSegment(
  collector: DefinitionDiagnosticCollector,
  segment: Segment,
  declared: ReadonlySet<string>,
): void {
  if (segment.stored.trim() === "") {
    if (segment.expected.length === 0) return;
    collector.add({
      code: "PH-DM-COMPATIBILITY-INVALID",
      path: segment.path,
      message:
        "The retained segment is empty, but the declaration expects it to declare types.",
      expected: segment.expected.map((type) => type.name).join(", "),
      received: "an empty segment",
      repair: "Retain the stored string that declares those types.",
    });
    return;
  }
  const parsed = collector.capture(() =>
    schemaFirstGraphQLDocument([segment.stored]),
  );
  if (parsed === undefined) return;
  const converted = structuredTypesFromDocument(
    parsed.document,
    declared,
    segment.path,
  );
  const byName = new Map(
    converted.types.map((type) => [type.name, type] as const),
  );
  const expectedNames = segment.expected.map((type) => type.name);
  const retainedNames = converted.types.map((type) => type.name);
  // A retained string may order its definitions differently — that is one of
  // the differences an override exists to keep — so the comparison is by
  // name, and the first difference is the one reported.
  const missing = expectedNames.filter((name) => !byName.has(name));
  const surplus = retainedNames.filter((name) => !expectedNames.includes(name));
  if (missing.length > 0 || surplus.length > 0) {
    collector.add({
      code: "PH-DM-COMPATIBILITY-INVALID",
      path: segment.path,
      message:
        missing.length > 0
          ? `The retained segment does not declare ${missing[0]}.`
          : `The retained segment declares ${surplus[0]}, which this segment does not carry.`,
      expected: expectedNames.join(", "),
      received: retainedNames.join(", "),
      repair:
        "Retain the exact stored string of this segment, or drop the override so the declaration prints its own.",
    });
    return;
  }
  for (const expected of segment.expected) {
    const retained = byName.get(expected.name);
    if (retained === undefined) continue;
    if (
      canonicalJson(withoutEmptyMarker(retained)) ===
      canonicalJson(withoutEmptyMarker(expected))
    ) {
      continue;
    }
    collector.add({
      code: "PH-DM-COMPATIBILITY-INVALID",
      path: [...segment.path, expected.name],
      message: `The retained segment describes ${expected.name} differently than the declaration does.`,
      expected: canonicalJson(expected),
      received: canonicalJson(retained),
      repair:
        "Make the declaration describe the stored type, or drop the override; a retained string that describes a different structure is a definition error.",
    });
    return;
  }
}

/**
 * Verifies the stored strings of one normalized artifact. Every segment is
 * checked, not only the retained ones: when nothing is retained the stored
 * string is the printer's own output, so the check is free and catches a
 * compiler defect as readily as a bad override.
 */
export function checkRetainedSerialization(
  artifact: {
    readonly definition: DocumentModelDefinition;
    readonly documentModel: DocumentModelPHState;
  },
  path: DefinitionPath = [],
): readonly DefinitionDiagnostic[] {
  const collector = new DefinitionDiagnosticCollector({
    kind: "document-model",
    key: artifact.definition.model.documentType,
  });
  artifact.definition.specifications.forEach((specification, index) => {
    const storedSpecification =
      artifact.documentModel.global.specifications.find(
        (candidate) => candidate.version === specification.version,
      );
    const at = [...path, "specifications", index];
    const operations = specification.modules.flatMap((module) =>
      module.operations.map((operation) => ({
        key: `${module.key}/${operation.key}`,
        input: operation.input,
      })),
    );
    const segments = assignStoredSegments({
      types: specification.types,
      globalRoot: specification.state.global.root.name,
      localRoot: specification.state.local.root?.name ?? null,
      operations,
    });
    const declared = new Set<string>([
      ...specification.types.map((type) => type.name),
      ...operations.flatMap((operation) =>
        operation.input === null ? [] : [operation.input.name],
      ),
    ]);

    compareSegment(
      collector,
      {
        path: [...at, "state", "global", "schema"],
        stored: specification.state.global.materialized.schema,
        expected: segments.global,
      },
      declared,
    );
    compareSegment(
      collector,
      {
        path: [...at, "state", "local", "schema"],
        stored: specification.state.local.materialized.schema,
        expected: segments.local,
      },
      declared,
    );

    specification.modules.forEach((module, moduleIndex) => {
      module.operations.forEach((operation, operationIndex) => {
        const storedSchema =
          storedSpecification?.modules[moduleIndex]?.operations[operationIndex]
            ?.schema;
        if (storedSchema === undefined || storedSchema === null) return;
        compareSegment(
          collector,
          {
            path: [
              ...at,
              "modules",
              moduleIndex,
              "operations",
              operationIndex,
              "schema",
            ],
            stored: storedSchema,
            expected:
              segments.operations.get(`${module.key}/${operation.key}`) ??
              (operation.input === null ? [] : [operation.input]),
          },
          declared,
        );
      });
    });

    // A retained initial value is checked at finalization, where JSON needs
    // no parser this entry cannot load; re-checking it here keeps one report
    // for a reviewer looking at a published candidate.
    for (const scope of ["global", "local"] as const) {
      const state = specification.state[scope];
      const stored = state.materialized.initialValue;
      if (stored.trim() === "") continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(stored);
      } catch (error) {
        collector.add({
          code: "PH-DM-COMPATIBILITY-INVALID",
          path: [...at, "state", scope, "initialValue"],
          message: `The retained initial value is not JSON: ${error instanceof Error ? error.message : String(error)}`,
          expected: "a stored JSON string",
          received: stored,
          repair: "Retain the exact stored initialValue string.",
        });
        continue;
      }
      if (canonicalJson(parsed) === canonicalJson(state.initialValue)) continue;
      collector.add({
        code: "PH-DM-COMPATIBILITY-INVALID",
        path: [...at, "state", scope, "initialValue"],
        message:
          "The retained initial value describes a different value than the declaration.",
        expected: canonicalJson(state.initialValue),
        received: canonicalJson(parsed),
        repair:
          "Make the declaration's initialValue equal to the stored one, or drop the override.",
      });
    }
  });
  return collector.diagnostics;
}
