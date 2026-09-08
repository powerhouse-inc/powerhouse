import { describe, expect, it } from "vitest";
import { renderCodeFirstSubgraph } from "../../src/tooling/subgraph-migration-source.js";

describe("renderCodeFirstSubgraph", () => {
  it("preserves the gql import form used by the legacy module", () => {
    const source = renderCodeFirstSubgraph({
      name: "example",
      exportName: "ExampleSubgraph",
      typeDefs: {
        kind: "gql-source",
        binding: {
          importSpecifier: "./schema.js",
          exportName: "schemaSource",
          kind: "named",
        },
        gql: {
          importSpecifier: "graphql-tag",
          exportName: "default",
          kind: "default",
        },
      },
      resolvers: {
        kind: "map",
        binding: {
          importSpecifier: "./resolvers.js",
          exportName: "resolvers",
          kind: "named",
        },
      },
      hasSubscriptions: false,
    });

    expect(source).toContain('import legacyGql from "graphql-tag";');
    expect(source).toContain("typeDefs: legacyGql(legacyTypeDefs)");
    expect(source).not.toContain("import { gql }");
  });

  it("does not interpolate route names into comments or emit reserved exports", () => {
    const request = {
      name: "*/ injected comment",
      exportName: "ExampleSubgraph",
      typeDefs: {
        kind: "document" as const,
        binding: {
          importSpecifier: "./schema.js",
          exportName: "schema",
          kind: "named" as const,
        },
      },
      resolvers: {
        kind: "map" as const,
        binding: {
          importSpecifier: "./resolvers.js",
          exportName: "resolvers",
          kind: "named" as const,
        },
      },
      hasSubscriptions: false,
    };
    const source = renderCodeFirstSubgraph(request);

    expect(source).toContain('name: "*/ injected comment"');
    expect(source).not.toContain('candidate for the "*/ injected comment"');
    expect(() =>
      renderCodeFirstSubgraph({ ...request, exportName: "default" }),
    ).toThrow("PH-MIGRATE-SUBGRAPH-EXPORT-INVALID");
  });
});
