import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildASTSchema,
  buildSchema,
  GraphQLInputObjectType,
  type GraphQLObjectType,
  lexicographicSortSchema,
  parse,
  printSchema,
  visit,
  type GraphQLSchema,
} from "graphql";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

/** The reactor subgraph's SDL as it is served. */
const SOURCE = readFileSync(
  join(here, "../../src/graphql/reactor/schema.graphql"),
  "utf8",
);
const schema = buildSchema(SOURCE);

/**
 * The SDL before the read/write split, with undo v3's `createDefaults`
 * `documentType` argument and `undoRedoTargets` query, sorted. The only change the split may
 * make to the wire is {@link CONSISTENCY_FIELDS} taking a `consistency`
 * argument and the two input types it needs.
 */
const BASELINE = readFileSync(join(here, "reactor-schema.baseline.graphql"), {
  encoding: "utf8",
});

const CONSISTENCY_FIELDS = [
  "document",
  "documentIncomingRelationshipEdges",
  "documentIncomingRelationships",
  "documentOutgoingRelationshipEdges",
  "documentOutgoingRelationships",
  "findDocuments",
];

const ADDED_TYPES = ["ConsistencyCoordinateInput", "ConsistencyTokenInput"];

/** The schema with exactly the allowed addition taken out again. */
function withoutTheAddition(source: string): GraphQLSchema {
  let inQuery = false;
  const stripped = visit(parse(source), {
    InputObjectTypeDefinition: (node) =>
      ADDED_TYPES.includes(node.name.value) ? null : undefined,
    ObjectTypeDefinition: {
      enter: (node) => {
        inQuery = node.name.value === "Query";
      },
      leave: () => {
        inQuery = false;
      },
    },
    FieldDefinition: (node) => {
      if (!inQuery || !CONSISTENCY_FIELDS.includes(node.name.value)) {
        return undefined;
      }
      return {
        ...node,
        arguments: node.arguments?.filter(
          (arg) => arg.name.value !== "consistency",
        ),
      };
    },
  });
  return buildASTSchema(stripped);
}

/** Field name to printed type, for comparing an input with an output type. */
function fieldTypes(
  type: GraphQLObjectType | GraphQLInputObjectType,
): Record<string, string> {
  return Object.fromEntries(
    Object.values(type.getFields()).map((field) => [
      field.name,
      String(field.type),
    ]),
  );
}

describe("reactor schema", () => {
  it("is the baseline plus the consistency argument and nothing else", () => {
    // Both sides printed the same way, so a formatter touching the baseline
    // file changes nothing.
    expect(
      printSchema(lexicographicSortSchema(withoutTheAddition(SOURCE))),
    ).toBe(printSchema(lexicographicSortSchema(buildSchema(BASELINE))));
  });

  it("takes an optional consistency token on exactly the six reads", () => {
    const query = schema.getQueryType()!;
    const taking = Object.values(query.getFields())
      .filter((field) => field.args.some((arg) => arg.name === "consistency"))
      .map((field) => field.name)
      .sort();
    expect(taking).toEqual(CONSISTENCY_FIELDS);
    for (const name of CONSISTENCY_FIELDS) {
      const arg = query
        .getFields()
        [name].args.find((candidate) => candidate.name === "consistency");
      expect(String(arg?.type), name).toBe("ConsistencyTokenInput");
    }
  });

  it("shapes the token input as the token JobInfo returns", () => {
    const token = schema.getType("ConsistencyTokenInput");
    const coordinate = schema.getType("ConsistencyCoordinateInput");
    expect(token).toBeInstanceOf(GraphQLInputObjectType);
    expect(coordinate).toBeInstanceOf(GraphQLInputObjectType);

    expect(fieldTypes(token as GraphQLInputObjectType)).toEqual({
      ...fieldTypes(schema.getType("ConsistencyToken") as GraphQLObjectType),
      coordinates: "[ConsistencyCoordinateInput!]!",
    });
    expect(fieldTypes(coordinate as GraphQLInputObjectType)).toEqual(
      fieldTypes(schema.getType("ConsistencyCoordinate") as GraphQLObjectType),
    );
  });
});
