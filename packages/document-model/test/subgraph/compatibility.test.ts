import { parse, print } from "graphql";
import { describe, expect, it } from "vitest";
import {
  compareResolverCoordinates,
  coordinatesOfResolverMap,
  normalizeCompatibility,
  runtimeHasSubscriptions,
  typeKindsOfDocument,
} from "../../src/definition/subgraph/compatibility.js";

/**
 * The compatibility path, which is what keeps the typed grammar honest.
 *
 * A subgraph whose schema the builders cannot state exactly declares the AST
 * it already has. Nothing here reinterprets that AST: the whole point is that
 * an existing subgraph keeps serving the schema it served, in the order it
 * served it.
 */

const SOURCE = `directive @tag(name: String!) on FIELD_DEFINITION

scalar Cursor

enum Visibility {
  PUBLIC
  PRIVATE
}

interface Node {
  id: ID!
}

type Folder implements Node {
  id: ID!
  name: String! @tag(name: "public")
  children: [Node!]!
}

union Entry = Folder

extend type Query {
  node(id: ID!): Node
}

type Query {
  folder(id: ID!, after: Cursor): Folder
}

schema {
  query: Query
}
`;

function compatibility(overrides: Record<string, unknown> = {}) {
  return {
    kind: "graphql-ast-v1" as const,
    typeDefs: parse(SOURCE),
    resolverCoordinates: [
      {
        typeName: "Query",
        fieldName: "folder",
        resolverKind: "field" as const,
      },
      {
        typeName: "Node",
        fieldName: null,
        resolverKind: "resolveType" as const,
      },
    ],
    getResolvers: () => ({}),
    hasSubscriptions: undefined,
    preserveDefinitionOrder: true as const,
    ...overrides,
  };
}

describe("normalizing a compatibility declaration", () => {
  it("round-trips the document, in source order", () => {
    const normalized = normalizeCompatibility(compatibility());
    expect(normalized.diagnostics).toEqual([]);
    // Printed from the stripped AST, compared with the printed original: the
    // order of every definition is part of the schema a client already sees.
    expect(print(normalized.document as never)).toBe(print(parse(SOURCE)));
  });

  it("strips locations and nothing else", () => {
    const normalized = normalizeCompatibility(compatibility());
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (node === null || typeof node !== "object") return;
      expect(Object.keys(node)).not.toContain("loc");
      Object.values(node).forEach(walk);
    };
    walk(normalized.document);
    // Canonicalizable, which the original `DocumentNode` is not.
    expect(() => JSON.stringify(normalized.document)).not.toThrow();
  });

  it("reinterprets no directive, extension, or enum map", () => {
    const printed = print(
      normalizeCompatibility(compatibility()).document as never,
    );
    expect(printed).toContain("directive @tag");
    expect(printed).toContain('@tag(name: "public")');
    expect(printed).toContain("extend type Query");
    expect(printed).toContain("enum Visibility");
    expect(printed).toContain("schema {");
  });
});

describe("hasSubscriptions", () => {
  it("maps undefined to null and restores it", () => {
    const normalized = normalizeCompatibility(compatibility());
    expect(normalized.hasSubscriptions).toBeNull();
    expect(
      runtimeHasSubscriptions(normalized.hasSubscriptions),
    ).toBeUndefined();
  });

  it("round-trips false and true distinctly", () => {
    // Both `undefined` and `false` disable transports under the host's truthy
    // check, but a migration that conflated them could not tell whether it was
    // allowed to leave a socket off.
    for (const value of [false, true]) {
      const normalized = normalizeCompatibility(
        compatibility({ hasSubscriptions: value }),
      );
      expect(normalized.hasSubscriptions).toBe(value);
      expect(runtimeHasSubscriptions(normalized.hasSubscriptions)).toBe(value);
    }
  });
});

describe("resolver coordinates", () => {
  const typeKinds = typeKindsOfDocument(
    normalizeCompatibility(compatibility()).document,
  );

  it("follow resolver-map insertion order, with null for a type-level entry", () => {
    const coordinates = coordinatesOfResolverMap(
      {
        Query: { folder: () => null, node: () => null },
        Node: { __resolveType: () => "Folder" },
        Folder: { children: () => [] },
        Visibility: { PUBLIC: "PUBLIC" },
        Cursor: { serialize: (value: unknown) => value },
      },
      typeKinds,
    );
    expect(coordinates).toEqual([
      { typeName: "Query", fieldName: "folder", resolverKind: "field" },
      { typeName: "Query", fieldName: "node", resolverKind: "field" },
      { typeName: "Node", fieldName: null, resolverKind: "resolveType" },
      { typeName: "Folder", fieldName: "children", resolverKind: "field" },
      // Read from the AST's type kinds, not guessed from the value's shape.
      { typeName: "Visibility", fieldName: null, resolverKind: "enum" },
      { typeName: "Cursor", fieldName: null, resolverKind: "scalar" },
    ]);
  });

  it("preserves the key order inside a subscription wrapper", () => {
    const coordinates = coordinatesOfResolverMap(
      {
        Subscription: {
          changed: { subscribe: () => null, resolve: () => null },
        },
      },
      new Map([["Subscription", "ObjectTypeDefinition"]]),
    );
    expect(coordinates.map((entry) => entry.resolverKind)).toEqual([
      "subscribe",
      "resolve",
    ]);
  });

  it("reports a declaration that disagrees with the real map", () => {
    const declared = [
      {
        typeName: "Query",
        fieldName: "folder",
        resolverKind: "field" as const,
      },
      { typeName: "Query", fieldName: "gone", resolverKind: "field" as const },
    ];
    const actual = [
      {
        typeName: "Query",
        fieldName: "folder",
        resolverKind: "field" as const,
      },
      { typeName: "Query", fieldName: "added", resolverKind: "field" as const },
    ];
    const diagnostics = compareResolverCoordinates(declared, actual, [
      "compatibility",
    ]);
    expect(diagnostics.map((entry) => entry.message)).toEqual([
      "The resolver map binds Query.added:field, which the declaration does not list.",
      "The declaration lists Query.gone:field, which the resolver map does not bind.",
    ]);
  });

  it("says nothing when they agree", () => {
    const coordinates = [
      {
        typeName: "Query",
        fieldName: "folder",
        resolverKind: "field" as const,
      },
    ];
    expect(
      compareResolverCoordinates(coordinates, coordinates, ["compatibility"]),
    ).toEqual([]);
  });

  it("refuses a duplicate or malformed coordinate", () => {
    const normalized = normalizeCompatibility(
      compatibility({
        resolverCoordinates: [
          { typeName: "Query", fieldName: "folder", resolverKind: "field" },
          { typeName: "Query", fieldName: "folder", resolverKind: "field" },
          { typeName: "Query", fieldName: "x", resolverKind: "invented" },
        ],
      }),
    );
    expect(normalized.diagnostics.map((entry) => entry.message)).toEqual([
      "invented is not a resolver kind.",
      "Coordinate Query.folder:field is declared twice.",
    ]);
  });
});

describe("the resolver factory", () => {
  it("is never called by normalization", () => {
    // Checking and inspecting must not run host code: a factory can allocate,
    // read a dependency, or count its own calls.
    let calls = 0;
    normalizeCompatibility(
      compatibility({
        getResolvers: () => {
          calls += 1;
          return {};
        },
      }),
    );
    expect(calls).toBe(0);
  });
});
