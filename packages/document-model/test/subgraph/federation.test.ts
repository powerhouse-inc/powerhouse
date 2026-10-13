import { parse } from "graphql";
import { describe, expect, it } from "vitest";
import {
  DEFINITION_DIAGNOSTIC_CODES,
  sortDefinitionDiagnostics,
} from "../../src/definition/diagnostics.js";
import { ph } from "../../src/definition/field.js";
import { normalizeCompatibility } from "../../src/definition/subgraph/compatibility.js";
import { compileSubgraph } from "../../src/definition/subgraph/definer.js";
import {
  type ComposedSubgraph,
  checkFederationSurface,
  composedSubgraphOf,
  directiveUsesOfDocument,
  reportCompositionPolicy,
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

describe("composition policy", () => {
  const left: ComposedSubgraph = {
    name: "accounts",
    coordinates: ["Query.account", "Query.shared"],
    types: [
      {
        kind: "object" as const,
        name: "Account",
        description: null,
        fields: [
          {
            key: "id",
            name: "id",
            description: null,
            deprecated: null,
            type: { kind: "scalar" as const, name: "OID", required: true },
          },
        ],
      },
    ],
  };
  const right: ComposedSubgraph = {
    name: "billing",
    coordinates: ["Query.invoice", "Query.shared"],
    types: [
      {
        kind: "object" as const,
        name: "Account",
        description: null,
        fields: [
          {
            key: "id",
            name: "id",
            description: null,
            deprecated: null,
            type: { kind: "scalar" as const, name: "String", required: true },
          },
        ],
      },
    ],
  };

  it("reports both codes on a crafted pair, as warnings", () => {
    const diagnostics = reportCompositionPolicy([left, right]);
    expect(diagnostics.map((entry) => entry.code).sort()).toEqual([
      "PH-GQL-COORDINATE-OWNED",
      "PH-GQL-SHARED-DEFINITION-MISMATCH",
    ]);
    for (const diagnostic of diagnostics) {
      expect(diagnostic.severity).toBe("warning");
      expect(diagnostic.phase).toBe("composition");
    }
    expect(
      diagnostics.find((entry) => entry.code === "PH-GQL-COORDINATE-OWNED")
        ?.message,
    ).toBe("Query.shared is owned by accounts and billing.");
  });

  it("says nothing when the two agree", () => {
    expect(
      reportCompositionPolicy([
        left,
        { ...right, types: left.types, coordinates: ["Query.invoice"] },
      ]),
    ).toEqual([]);
  });

  it("compares definitions canonically, so field order matters", () => {
    const account = left.types[0];
    if (account.kind !== "object") throw new Error("unreachable");
    const reordered: ComposedSubgraph = {
      ...left,
      name: "other",
      coordinates: [],
      types: [
        {
          ...account,
          fields: [
            {
              key: "name",
              name: "name",
              description: null,
              deprecated: null,
              type: { kind: "scalar", name: "String", required: false },
            },
            ...account.fields,
          ],
        },
      ],
    };
    expect(
      reportCompositionPolicy([left, reordered]).map((entry) => entry.code),
    ).toEqual(["PH-GQL-SHARED-DEFINITION-MISMATCH"]);
  });

  it("carries no code that could make a report invalid on its own", () => {
    for (const code of [
      "PH-GQL-COORDINATE-OWNED",
      "PH-GQL-SHARED-DEFINITION-MISMATCH",
    ] as const) {
      expect(DEFINITION_DIAGNOSTIC_CODES[code].severity).toBe("warning");
    }
    const sorted = sortDefinitionDiagnostics(
      reportCompositionPolicy([left, right]),
    );
    expect(sorted.every((entry) => entry.severity === "warning")).toBe(true);
  });
});

describe("composedSubgraphOf", () => {
  it("takes a typed definition's types and root coordinates in entry order", () => {
    const Widget = ph.object("Widget", {
      fields: { id: ph.OID({ required: true }) },
    });
    const { definition } = compileSubgraph({
      name: "widgets",
      schemaKind: "typed",
      entries: (build) => [
        build.mutation("rename", {
          returns: ph.ref(Widget, { required: true }),
          resolve: () => ({ id: "w" }),
        }),
        build.query("widget", {
          returns: ph.ref(Widget),
          resolve: () => null,
        }),
        build.subscription("widgetChanged", {
          returns: ph.ref(Widget, { required: true }),
          subscribe: () => (async function* () {})(),
        }),
      ],
    });
    const composed = composedSubgraphOf(definition);
    expect(composed.name).toBe("widgets");
    expect(composed.coordinates).toEqual([
      "Mutation.rename",
      "Query.widget",
      "Subscription.widgetChanged",
    ]);
    expect(composed.types.map((type) => type.name)).toEqual(["Widget"]);
  });

  it("reports a shared object type that differs, not roots that differ", () => {
    const declare = (name: string, field: string, widgetFields: string[]) => {
      const Widget = ph.object("Widget", {
        fields: Object.fromEntries(
          widgetFields.map((key) => [key, ph.String()]),
        ),
      });
      return composedSubgraphOf(
        compileSubgraph({
          name,
          schemaKind: "typed",
          entries: (build) => [
            build.query(field, {
              returns: ph.ref(Widget),
              resolve: () => null,
            }),
          ],
        }).definition,
      );
    };
    expect(
      reportCompositionPolicy([
        declare("alpha", "a", ["id"]),
        declare("beta", "b", ["id"]),
      ]),
    ).toEqual([]);
    expect(
      reportCompositionPolicy([
        declare("alpha", "a", ["id"]),
        declare("beta", "b", ["id", "label"]),
      ]).map((diagnostic) => diagnostic.message),
    ).toEqual(["Widget is defined differently by alpha; beta."]);
  });

  it("takes nothing from a compatibility definition", () => {
    const { definition } = compileSubgraph({
      name: "compat",
      schemaKind: "graphql-ast-compat",
      compatibility: {
        kind: "graphql-ast-v1",
        typeDefs: parse("type Query { thing: String }"),
        resolverCoordinates: [],
        getResolvers: () => ({}),
        hasSubscriptions: undefined,
        preserveDefinitionOrder: true,
      },
    });
    expect(composedSubgraphOf(definition)).toEqual({
      name: "compat",
      types: [],
      coordinates: [],
    });
  });
});
