import { ph } from "document-model";
import { parse, print } from "graphql";
import { gql } from "graphql-tag";
import { describe, expect, it } from "vitest";
import { BaseSubgraph } from "../src/graphql/base-subgraph.js";
import { defineSubgraph } from "../src/graphql/define-subgraph.js";
import type { SubgraphArgs } from "../src/graphql/types.js";

/**
 * A subgraph written with `defineSubgraph` and the same subgraph written by
 * hand must produce identical results: the printed AST, the resolver
 * coordinates and their order, and each resolver's arguments, return value,
 * and thrown error.
 */

function args(): SubgraphArgs {
  return {
    reactorClient: {},
    relationalDb: {},
    analyticsStore: {},
    graphqlManager: {},
    syncManager: {},
    authorizationService: {},
  } as unknown as SubgraphArgs;
}

const Visibility = ph.enum("Visibility", { values: ["PUBLIC", "PRIVATE"] });

const Widget = ph.object("Widget", {
  fields: {
    id: ph.OID({ required: true }),
    label: ph.String({ required: true }),
    visibility: ph.ref(Visibility, { required: true }),
  },
});

/** The declaration, code-first. */
const CodeFirst = defineSubgraph({
  name: "widgets",
  schemaKind: "typed",
  definitionOrder: ["OID", "Visibility", "Widget", "Query", "Mutation"],
  entries: (build) => [
    build.query("widget", {
      args: { id: ph.OID({ required: true }) },
      returns: ph.ref(Widget),
      resolve: ({ args: a }) => ({
        id: String(a.id),
        label: "One",
        visibility: "PUBLIC" as const,
      }),
    }),
    build.mutation("setLabel", {
      args: {
        id: ph.OID({ required: true }),
        label: ph.String({ required: true }),
      },
      returns: ph.ref(Widget, { required: true }),
      resolve: ({ args: a }) => {
        if (String(a.label) === "") throw new Error("A label cannot be empty.");
        return {
          id: String(a.id),
          label: String(a.label),
          visibility: "PUBLIC" as const,
        };
      },
    }),
  ],
});

/** The same schema and the same behaviour, written by hand. */
const SCHEMA_FIRST_SDL = `scalar OID

enum Visibility {
  PUBLIC
  PRIVATE
}

type Widget {
  id: OID!
  label: String!
  visibility: Visibility!
}

type Query {
  widget(id: OID!): Widget
}

type Mutation {
  setLabel(id: OID!, label: String!): Widget!
}
`;

class SchemaFirst extends BaseSubgraph {
  name = "widgets";
  typeDefs = gql`
    ${SCHEMA_FIRST_SDL}
  `;
  resolvers = {
    Query: {
      widget: (_parent: unknown, a: { id: string }) => ({
        id: a.id,
        label: "One",
        visibility: "PUBLIC",
      }),
    },
    Mutation: {
      setLabel: (_parent: unknown, a: { id: string; label: string }) => {
        if (a.label === "") throw new Error("A label cannot be empty.");
        return { id: a.id, label: a.label, visibility: "PUBLIC" };
      },
    },
  };
}

describe("the author AST", () => {
  it("is identical, definition for definition", () => {
    const generated = new CodeFirst(args());
    // Both sides are printed from a parsed AST, so the comparison ignores
    // whitespace.
    expect(print(generated.typeDefs)).toBe(print(parse(SCHEMA_FIRST_SDL)));
  });

  it("fails when a field is reordered in the declaration", () => {
    // Shows the comparison above detects field order.
    const Reordered = defineSubgraph({
      name: "widgets",
      schemaKind: "typed",
      entries: (build) => [
        build.mutation("setLabel", {
          args: {
            id: ph.OID({ required: true }),
            label: ph.String({ required: true }),
          },
          returns: ph.ref(Widget, { required: true }),
          resolve: () => ({
            id: "w",
            label: "l",
            visibility: "PUBLIC" as const,
          }),
        }),
        build.query("widget", {
          args: { id: ph.OID({ required: true }) },
          returns: ph.ref(Widget),
          resolve: () => null,
        }),
      ],
    });
    expect(print(new Reordered(args()).typeDefs)).not.toBe(
      print(parse(SCHEMA_FIRST_SDL)),
    );
  });
});

describe("resolver coordinates", () => {
  it("are the same, in the same order", () => {
    const coordinates = (resolvers: Record<string, unknown>) =>
      Object.entries(resolvers).flatMap(([typeName, fields]) =>
        Object.keys(fields as Record<string, unknown>).map(
          (fieldName) => `${typeName}.${fieldName}`,
        ),
      );
    expect(coordinates(new CodeFirst(args()).resolvers)).toEqual([
      "Query.widget",
      "Mutation.setLabel",
    ]);
    expect(coordinates(new SchemaFirst(args()).resolvers)).toEqual([
      "Query.widget",
      "Mutation.setLabel",
    ]);
  });
});

describe("results and errors", () => {
  function call(
    instance: BaseSubgraph,
    type: string,
    field: string,
    a: Record<string, unknown>,
  ): unknown {
    const resolver = (
      instance.resolvers as Record<
        string,
        Record<string, (...rest: unknown[]) => unknown>
      >
    )[type][field];
    return resolver(undefined, a, {}, {});
  }

  it("resolve to the same value", () => {
    const expected = { id: "w1", label: "One", visibility: "PUBLIC" };
    expect(
      call(new CodeFirst(args()), "Query", "widget", { id: "w1" }),
    ).toEqual(expected);
    expect(
      call(new SchemaFirst(args()), "Query", "widget", { id: "w1" }),
    ).toEqual(expected);
  });

  it("throw the same error text", () => {
    const thrown = (instance: BaseSubgraph) => {
      try {
        call(instance, "Mutation", "setLabel", { id: "w1", label: "" });
        return null;
      } catch (error) {
        return (error as Error).message;
      }
    };
    expect(thrown(new CodeFirst(args()))).toBe("A label cannot be empty.");
    expect(thrown(new CodeFirst(args()))).toBe(thrown(new SchemaFirst(args())));
  });
});

describe("the published definition", () => {
  it("records the authored order it printed", () => {
    const { definition } = CodeFirst;
    expect(
      definition.schemaKind === "typed" && definition.definitionOrder,
    ).toEqual(["OID", "Visibility", "Widget", "Query", "Mutation"]);
  });
});
