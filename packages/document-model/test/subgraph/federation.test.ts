import { parse } from "graphql";
import { describe, expect, it } from "vitest";
import { normalizeCompatibility } from "../../src/definition/subgraph/compatibility.js";
import {
  checkFederationSurface,
  directiveUsesOfDocument,
} from "../../src/definition/subgraph/federation.js";

const V2_SOURCE = `extend schema @link(url: "https://specs.apollo.dev/federation/v2.0")

type Account @shareable @key(fields: "id", resolvable: false) {
  id: ID! @inaccessible
  name: String @override(from: "other")
}
`;

describe("Federation 2 in a typed declaration", () => {
  const uses = directiveUsesOfDocument(
    normalizeCompatibility({
      kind: "graphql-ast-v1",
      typeDefs: parse(V2_SOURCE),
      resolverCoordinates: [],
      getResolvers: () => ({}),
      hasSubscriptions: undefined,
      preserveDefinitionOrder: true,
    }).document,
  );

  it.each(["link", "shareable", "inaccessible", "override"])(
    "rejects @%s",
    (directive) => {
      const diagnostics = checkFederationSurface({
        directives: uses.filter((use) => use.name === directive),
      });
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].code).toBe("PH-GQL-FEDERATION-UNSUPPORTED");
      expect(diagnostics[0].repair).toContain("graphql-ast-compat");
    },
  );

  it("rejects the v2 @key form without rejecting @key itself", () => {
    const v2Key = checkFederationSurface({
      directives: [
        { name: "key", argumentNames: ["fields", "resolvable"], path: [] },
      ],
    });
    expect(v2Key).toHaveLength(1);
    const v1Key = checkFederationSurface({
      directives: [{ name: "key", argumentNames: ["fields"], path: [] }],
    });
    expect(v1Key).toEqual([]);
  });

  it("says nothing about an ordinary directive", () => {
    expect(
      checkFederationSurface({
        directives: [
          { name: "deprecated", argumentNames: ["reason"], path: [] },
        ],
      }),
    ).toEqual([]);
  });

  it("leaves a compatibility document alone", () => {
    const normalized = normalizeCompatibility({
      kind: "graphql-ast-v1",
      typeDefs: parse(V2_SOURCE),
      resolverCoordinates: [],
      getResolvers: () => ({}),
      hasSubscriptions: undefined,
      preserveDefinitionOrder: true,
    });
    expect(normalized.diagnostics).toEqual([]);
    expect(
      directiveUsesOfDocument(normalized.document).map((u) => u.name),
    ).toEqual(["link", "shareable", "key", "inaccessible", "override"]);
  });
});
